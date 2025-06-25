// Background service worker - manages WebSocket connections

import { WebSocketManager } from './modules/websocket-manager.js';
import { StateManager } from './modules/state-manager.js';
import { PortManager } from './modules/port-manager.js';
import { MessageHandler } from './modules/message-handler.js';

// Initialize modules
const wsManager = new WebSocketManager();
const stateManager = new StateManager();
const portManager = new PortManager();
const messageHandler = new MessageHandler(wsManager, stateManager);

// Listen for state changes and broadcast to all ports
stateManager.addListener((tabId, state) => {
  portManager.broadcast({ type: 'state', tabId, ...state });
  
  // Update action badge for active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id === tabId) {
      updateActionBadge(state);
    }
  });
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
  portManager.addPort(port);
  
  port.onMessage.addListener((msg) => {
    if (msg.type === 'subscribe' && msg.tabId) {
      // Send current state to this port
      const state = stateManager.getState(msg.tabId);
      portManager.sendToPort(port, { type: 'state', tabId: msg.tabId, ...state });
    }
  });
});

// Handle all messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle content script messages
  if (sender.tab) {
    if (request.type === 'contentScriptReady') {
      console.log(`Content script ready in tab ${sender.tab.id}`);
      sendResponse({ acknowledged: true });
      return false;
    }
    
    if (request.type === 'connect' || request.type === 'disconnect') {
      messageHandler.handleMessage({ type: request.type, tabId: sender.tab.id }, sender)
        .then(response => sendResponse(response))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }
  }
  
  // Handle messages from popup/panel (not from content scripts)
  if (!sender.tab) {
    messageHandler.handleMessage(request, sender)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    
    return true; // Keep message channel open for async response
  }
});

// Update badge when active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  const state = stateManager.getState(activeInfo.tabId);
  updateActionBadge(state);
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  stateManager.removeTab(tabId);
});