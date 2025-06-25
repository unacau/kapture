// DevTools Panel UI

const tabId = chrome.devtools.inspectedWindow.tabId;
let port;

// Connect to background
port = chrome.runtime.connect();
port.postMessage({ type: 'subscribe', tabId });

// Listen for state updates
port.onMessage.addListener((msg) => {
  if (msg.type === 'state' && msg.tabId === tabId) {
    updateUI(msg.connected, msg.status);
  }
});

// Get initial state
chrome.runtime.sendMessage({ type: 'getState', tabId }, (state) => {
  updateUI(state.connected, state.status);
});

// Handle button click
document.getElementById('button').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'getState', tabId }, (state) => {
    if (state.connected || state.status === 'retrying') {
      chrome.runtime.sendMessage({ type: 'disconnect', tabId });
    } else {
      chrome.runtime.sendMessage({ type: 'connect', tabId });
    }
  });
});

// Update UI
function updateUI(connected, status = 'disconnected') {
  const statusEl = document.getElementById('status');
  const button = document.getElementById('button');
  
  switch (status) {
    case 'connected':
      statusEl.textContent = 'Connected';
      statusEl.className = 'status connected';
      button.textContent = 'Disconnect';
      button.disabled = false;
      break;
    
    case 'retrying':
      statusEl.textContent = 'Retrying...';
      statusEl.className = 'status retrying';
      button.textContent = 'Disconnect';
      button.disabled = false;
      break;
    
    case 'disconnected':
    default:
      statusEl.textContent = 'Disconnected';
      statusEl.className = 'status disconnected';
      button.textContent = 'Connect';
      button.disabled = false;
      break;
  }
}