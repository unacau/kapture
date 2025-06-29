import { TabState } from './tab-state.js';
import { backgroundCommands } from './background-commands.js';

export class TabManager {
  constructor() {
    this.tabs = new Map(); // tabId -> TabState
    this.listeners = new Set(); // State change listeners
  }

  // Tab lifecycle
  getOrCreateTab(tabId) {
    if (!this.tabs.has(tabId)) {
      const tabState = new TabState(tabId);
      this.tabs.set(tabId, tabState);
      this.notifyListeners(tabId, 'created', tabState);
    }
    return this.tabs.get(tabId);
  }

  getTab(tabId) {
    return this.tabs.get(tabId);
  }

  hasTab(tabId) {
    return this.tabs.has(tabId);
  }

  removeTab(tabId) {
    const tabState = this.tabs.get(tabId);
    if (tabState) {
      tabState.cleanup();
      this.tabs.delete(tabId);
      this.notifyListeners(tabId, 'removed', null);
    }
  }

  // WebSocket connection management
  async connect(tabId) {
    const tabState = this.getOrCreateTab(tabId);

    if (tabState.websocket && tabState.websocket.readyState === WebSocket.OPEN) {
      return { ok: true, message: 'Already connected' };
    }

    // Get tab info from content script
    const tabInfo = await chrome.tabs.sendMessage(tabId, { command: 'getTabInfo' });
    tabState.updatePageMetadata(tabInfo);

    // Set up connection
    tabState.connectionInfo.userDisconnected = false;

    await this._createConnection(tabState);

    return { ok: true };
  }

  disconnect(tabId) {
    const tabState = this.getTab(tabId);
    if (!tabState) {
      return { ok: false, error: 'Tab not found' };
    }

    tabState.connectionInfo.setDisconnected(true);

    // Clear keepalive interval
    if (tabState.keepaliveInterval) {
      clearInterval(tabState.keepaliveInterval);
      tabState.keepaliveInterval = null;
    }

    if (tabState.websocket) {
      tabState.websocket.close();
      tabState.clearWebSocket();
    }

    // Clear any pending reconnect
    if (tabState.connectionInfo.reconnectTimer) {
      clearTimeout(tabState.connectionInfo.reconnectTimer);
      tabState.connectionInfo.reconnectTimer = null;
    }

    this.notifyListeners(tabId, 'stateChanged', tabState);

    return { ok: true };
  }

  // Private connection methods
  async _createConnection(tabState) {
    // First check if tab still exists
    try {
      await chrome.tabs.get(tabState.tabId);
    } catch (error) {
      console.log(`Tab ${tabState.tabId} no longer exists, aborting connection`);
      this.removeTab(tabState.tabId);
      return;
    }

    const ws = new WebSocket(tabState.connectionInfo.url);
    tabState.setWebSocket(ws);

    // Clear any existing keepalive interval
    if (tabState.keepaliveInterval) {
      clearInterval(tabState.keepaliveInterval);
      tabState.keepaliveInterval = null;
    }

    ws.onopen = () => {
      tabState.connectionInfo.setConnected();
      this.notifyListeners(tabState.tabId, 'stateChanged', tabState);

      // Send registration message with Chrome tab ID and metadata
      const registerMessage = {
        type: 'register',
        requestedTabId: tabState.tabId.toString(), // Chrome tab ID
        ...tabState.pageMetadata
      };

      this.sendMessage(tabState.tabId, registerMessage);

      // Set up keepalive ping every 30 seconds
      tabState.keepaliveInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          } catch (e) {
            console.error('Failed to send keepalive ping:', e);
          }
        }
      }, 30000);
    };

    ws.onclose = () => {
      // Clear keepalive interval
      if (tabState.keepaliveInterval) {
        clearInterval(tabState.keepaliveInterval);
        tabState.keepaliveInterval = null;
      }

      tabState.clearWebSocket();

      if (!tabState.connectionInfo.userDisconnected) {
        // Schedule reconnect
        this._scheduleReconnect(tabState);
      } else {
        tabState.connectionInfo.setDisconnected(true);
      }

      this.notifyListeners(tabState.tabId, 'stateChanged', tabState);
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error for tab ${tabState.tabId}:`, error);
      tabState.connectionInfo.setError(error);
      // Don't clear WebSocket here - let onclose handle cleanup and reconnection
      this.notifyListeners(tabState.tabId, 'stateChanged', tabState);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Don't track pong messages
        if (data.type !== 'pong') {
          const message = tabState.addMessage('incoming', data);
          this.notifyListeners(tabState.tabId, 'messageReceived', tabState, message);
        }

        // Handle commands
        if (data.type === 'command' && data.command && data.id) {
          await this._handleCommand(tabState, data);
        } else if (data.type === 'pong') {
          // Pong received - connection is healthy
          tabState.lastPongTime = Date.now();
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
  }

  _scheduleReconnect(tabState) {
    // Clear any existing reconnect timer
    if (tabState.connectionInfo.reconnectTimer) {
      clearTimeout(tabState.connectionInfo.reconnectTimer);
      tabState.connectionInfo.reconnectTimer = null;
    }

    const attemptNumber = tabState.connectionInfo.reconnectAttempts;
    const backoffMs = this._getBackoffMs(attemptNumber);

    console.log(`Scheduling reconnect for tab ${tabState.tabId} in ${backoffMs}ms (attempt ${attemptNumber + 1})`);

    tabState.connectionInfo.setRetrying(attemptNumber + 1, backoffMs);
    this.notifyListeners(tabState.tabId, 'stateChanged', tabState);

    tabState.connectionInfo.reconnectTimer = setTimeout(async () => {
      if (!tabState.connectionInfo.userDisconnected) {
        // Check if tab still exists before attempting reconnect
        try {
          await chrome.tabs.get(tabState.tabId);
          console.log(`Attempting reconnect for tab ${tabState.tabId}`);
          this._createConnection(tabState);
        } catch (error) {
          console.log(`Tab ${tabState.tabId} no longer exists, removing from manager`);
          this.removeTab(tabState.tabId);
        }
      }
    }, backoffMs);
  }

  _getBackoffMs(attemptNumber) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, then cap at 60s
    return Math.min(1000 * Math.pow(2, attemptNumber), 60000);
  }

  async _handleCommand(tabState, {command, params, id}) {
    try {
      let result;
      // some need to run with the background context
      if (backgroundCommands[command]) {
        result = await backgroundCommands[command](tabState, params);
      }
      // others we execute in the page context
      else {
        result = await chrome.tabs.sendMessage(tabState.tabId, {command, params});
      }
      // `success: true` means we didn't throw an error. TODO: rename or remove it
      const response = {id, type: 'response', success: true, result};
      this.sendMessage(tabState.tabId, response);
    }
    catch (error) {
      const errorResponse = { id, type: 'response', success: false,  error: { message: error.message, code: 'COMMAND_FAILED' }};
      this.sendMessage(tabState.tabId, errorResponse);
    }
  }

  // Message sending
  sendMessage(tabId, data) {
    const tabState = this.getTab(tabId);
    if (!tabState || !tabState.websocket || tabState.websocket.readyState !== WebSocket.OPEN) {
      return { ok: false, error: 'Not connected' };
    }

    try {
      const message = tabState.addMessage('outgoing', data);
      tabState.websocket.send(JSON.stringify(data));
      this.notifyListeners(tabId, 'messageSent', tabState, message);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Message management
  clearMessages(tabId) {
    const tabState = this.getTab(tabId);
    if (tabState) {
      tabState.clearMessages();
      this.notifyListeners(tabId, 'messagesCleared', tabState);
    }
  }

  // Console log management
  addConsoleLog(tabId, level, args, stackTrace) {
    const tabState = this.getTab(tabId);
    if (tabState) {
      const log = tabState.addConsoleLog(level, args, stackTrace);
      this.notifyListeners(tabId, 'consoleLogAdded', tabState, log);
    }
  }

  clearConsoleLogs(tabId) {
    const tabState = this.getTab(tabId);
    if (tabState) {
      tabState.clearConsoleLogs();
      this.notifyListeners(tabId, 'consoleLogsCleared', tabState);
    }
  }

  // Port management
  addPort(tabId, port) {
    const tabState = this.getOrCreateTab(tabId);
    tabState.addPort(port);

    // Send initial state
    port.postMessage({
      type: 'state',
      tabId,
      ...tabState.getConnectionState()
    });

    // Send current messages
    port.postMessage({
      type: 'messages',
      tabId,
      messages: tabState.getMessages()
    });

    // Send console count
    port.postMessage({
      type: 'consoleCount',
      tabId,
      count: tabState.getConsoleLogCount()
    });
  }

  removePort(tabId, port) {
    const tabState = this.getTab(tabId);
    if (tabState) {
      tabState.removePort(port);
    }
  }

  // Event listeners
  addListener(callback) {
    this.listeners.add(callback);
  }

  removeListener(callback) {
    this.listeners.delete(callback);
  }

  notifyListeners(tabId, event, tabState, data = null) {
    this.listeners.forEach(callback => {
      try {
        callback(tabId, event, tabState, data);
      } catch (e) {
        console.error('Error in TabManager listener:', e);
      }
    });
  }

  // Utility
  getAllTabs() {
    return Array.from(this.tabs.values());
  }

  getActiveTabCount() {
    return this.tabs.size;
  }
}
