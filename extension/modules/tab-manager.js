import { TabState, ConnectionStatus } from './tab-state.js';

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

    this._createConnection(tabState);

    return { ok: true };
  }

  disconnect(tabId) {
    const tabState = this.getTab(tabId);
    if (!tabState) {
      return { ok: false, error: 'Tab not found' };
    }

    tabState.connectionInfo.setDisconnected(true);

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
  _createConnection(tabState) {
    const ws = new WebSocket(tabState.connectionInfo.url);
    tabState.setWebSocket(ws);

    ws.onopen = () => {
      tabState.connectionInfo.setConnected();
      this.notifyListeners(tabState.tabId, 'stateChanged', tabState);

      // Send registration message with metadata
      const registerMessage = {
        type: 'register',
        ...tabState.pageMetadata
      };

      this.sendMessage(tabState.tabId, registerMessage);
    };

    ws.onclose = () => {
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
      tabState.connectionInfo.setError(error);
      tabState.clearWebSocket();
      this.notifyListeners(tabState.tabId, 'stateChanged', tabState);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        const message = tabState.addMessage('incoming', data);
        this.notifyListeners(tabState.tabId, 'messageReceived', tabState, message);

        // Handle commands
        if (data.type === 'command' && data.command && data.id) {
          await this._handleCommand(tabState, data);
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
  }

  _scheduleReconnect(tabState) {
    const attemptNumber = tabState.connectionInfo.reconnectAttempts;
    const backoffMs = this._getBackoffMs(attemptNumber);

    tabState.connectionInfo.setRetrying(attemptNumber + 1, backoffMs);
    this.notifyListeners(tabState.tabId, 'stateChanged', tabState);

    tabState.connectionInfo.reconnectTimer = setTimeout(() => {
      if (!tabState.connectionInfo.userDisconnected) {
        this._createConnection(tabState);
      }
    }, backoffMs);
  }

  _getBackoffMs(attemptNumber) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, then cap at 60s
    return Math.min(1000 * Math.pow(2, attemptNumber), 60000);
  }

  async _handleCommand(tabState, {command, params, id}) {
    try {
      // Send command to content script
      const result = await chrome.tabs.sendMessage(tabState.tabId, { command, params });
      const response = { id, type: 'response', success: !result.error, result };
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
