// Popup UI

let tabId;
let port;

// Get current tab and set up
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  tabId = tabs[0].id;
  
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
  const button = document.getElementById('button');
  const buttonText = button.querySelector('.button-text');
  
  // Remove all state classes
  button.classList.remove('connected', 'disconnected', 'retrying');
  
  switch (status) {
    case 'connected':
      button.classList.add('connected');
      buttonText.textContent = 'Connected';
      break;
    
    case 'retrying':
      button.classList.add('retrying');
      buttonText.textContent = 'Connecting';
      break;
    
    case 'disconnected':
    default:
      button.classList.add('disconnected');
      buttonText.textContent = 'Connect';
      break;
  }
}