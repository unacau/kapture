// Background service worker - manages WebSocket connections

import { TabManager } from './modules/tab-manager.js';
import {ConsoleLogEntry} from "./modules/models.js";

// Single source of truth for all tab state
const tabManager = new TabManager();

// Listen for tab state changes
tabManager.addListener((tabId, event, tabState, data) => {
  switch (event) {
    case 'stateChanged':
      // Broadcast to all ports for this tab
      tabState.broadcastToPorts({
        type: 'state',
        tabId,
        ...tabState.getConnectionState()
      });

      // Update action badge for active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id === tabId) {
          updateActionBadge(tabState.getConnectionState());
        }
      });
      break;

    case 'messageReceived':
    case 'messageSent':
      // Broadcast updated messages to all ports
      tabState.broadcastToPorts({
        type: 'messages',
        tabId,
        messages: tabState.getMessages()
      });
      break;

    case 'consoleLogAdded':
      // Broadcast updated console count
      tabState.broadcastToPorts({
        type: 'consoleCount',
        tabId,
        count: tabState.getConsoleLogCount()
      });
      break;

    case 'messagesCleared':
      tabState.broadcastToPorts({
        type: 'messages',
        tabId,
        messages: []
      });
      break;

    case 'consoleLogsCleared':
      tabState.broadcastToPorts({
        type: 'consoleCount',
        tabId,
        count: 0
      });
      break;
  }
});

// Update action badge based on connection status
function updateActionBadge(state) {
  switch (state.status) {
    case 'connected':
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4caf50' });
      break;

    case 'retrying':
      chrome.action.setBadgeText({ text: '↻' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff9800' });
      break;

    case 'disconnected':
    default:
      chrome.action.setBadgeText({ text: '' });
      break;
  }
}

// Handle UI connections
chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    if (msg.type === 'subscribe' && msg.tabId) {
      tabManager.addPort(msg.tabId, port);
    } else if (msg.type === 'clearMessages' && msg.tabId) {
      tabManager.clearMessages(msg.tabId);
    } else if (msg.type === 'clearConsoleLogs' && msg.tabId) {
      tabManager.clearConsoleLogs(msg.tabId);
    }
  });

  port.onDisconnect.addListener(() => {
    // Remove port from all tabs
    tabManager.getAllTabs().forEach(tabState => {
      tabState.removePort(port);
    });
  });
});

// Handle all messages
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // Handle content script messages
  if (sender.tab) {
    if (request.type === 'contentScriptReady') {
      console.log(`Content script ready in tab ${sender.tab.id}`);
      sendResponse({ acknowledged: true });
      return false;
    }

    if (request.type === 'connect') {
      const result = await tabManager.connect(sender.tab.id);
      sendResponse(result);
      return true; // Keep message channel open for async response
    }

    if (request.type === 'disconnect') {
      const result = tabManager.disconnect(sender.tab.id);
      sendResponse(result);
      return false;
    }

    if (request.type === 'openPopup') {
      chrome.action.openPopup();
      sendResponse({ ok: true });
      return false;
    }

    if (request.type === 'mousePosition') {
      // Store mouse position for the tab
      const tabState = tabManager.getTab(sender.tab.id);
      if (tabState) {
        tabState.setMousePosition({ x: request.x, y: request.y });
      }
      return false;
    }

    if (request.type === 'consoleLog') {
      // Handle console log from content script
      const tabState = tabManager.getTab(sender.tab.id);
      if (tabState) {
        if (request.level === 'clear') {
          // Clear console logs
          tabManager.clearConsoleLogs(sender.tab.id);
        } else {
          // Add console log
          tabManager.addConsoleLog(sender.tab.id, new ConsoleLogEntry(
            request.level,
            request.args,
            request.stackTrace
          ));
        }
      }
      return false;
    }
  }

  // Handle messages from popup/panel (not from content scripts)
  if (!sender.tab) {
    if (request.type === 'connect' && request.tabId) {
      const result = await tabManager.connect(request.tabId);
      sendResponse(result);
      return true; // Keep message channel open for async response
    }

    if (request.type === 'disconnect' && request.tabId) {
      const result = tabManager.disconnect(request.tabId);
      sendResponse(result);
      return false;
    }

    if (request.type === 'getState' && request.tabId) {
      const tabState = tabManager.getTab(request.tabId);
      sendResponse(tabState ? tabState.getConnectionState() : { connected: false, status: 'disconnected' });
      return false;
    }
  }
});

// Update badge when active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabState = tabManager.getTab(activeInfo.tabId);
  if (tabState) {
    updateActionBadge(tabState.getConnectionState());
  } else {
    updateActionBadge({ status: 'disconnected' });
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabManager.removeTab(tabId);
});
