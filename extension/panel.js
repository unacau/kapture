// DevTools Panel UI with Real Connection and Mock Data

const tabId = chrome.devtools.inspectedWindow.tabId;
let selectedMessageIndex = -1;
let messages = [];
let consoleLogCount = 0;
let port = null;

// Mock data for demonstration
const mockMessages = [
  {
    id: '1',
    type: 'command',
    direction: 'outgoing',
    data: { type: 'navigate', params: { url: 'https://example.com' } },
    timestamp: new Date(Date.now() - 50000)
  },
  {
    id: '2',
    type: 'response',
    direction: 'incoming',
    data: { success: true, result: { url: 'https://example.com', title: 'Example Domain' } },
    timestamp: new Date(Date.now() - 48000)
  },
  {
    id: '3',
    type: 'command',
    direction: 'outgoing',
    data: { type: 'click', params: { selector: 'button#submit' } },
    timestamp: new Date(Date.now() - 40000)
  },
  {
    id: '4',
    type: 'response',
    direction: 'incoming',
    data: { success: true, result: { element: 'button#submit', clicked: true } },
    timestamp: new Date(Date.now() - 39000)
  },
  {
    id: '5',
    type: 'command',
    direction: 'outgoing',
    data: { type: 'screenshot', params: { selector: '.header' } },
    timestamp: new Date(Date.now() - 30000)
  },
  {
    id: '6',
    type: 'response',
    direction: 'incoming',
    data: { 
      success: true, 
      result: { 
        screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        element: '.header',
        dimensions: { width: 1200, height: 100 }
      } 
    },
    timestamp: new Date(Date.now() - 28000)
  },
  {
    id: '7',
    type: 'command',
    direction: 'outgoing',
    data: { type: 'evaluate', params: { expression: 'document.title' } },
    timestamp: new Date(Date.now() - 20000)
  },
  {
    id: '8',
    type: 'response',
    direction: 'incoming',
    data: { success: true, result: 'Example Domain' },
    timestamp: new Date(Date.now() - 19000)
  }
];

// Initialize UI
function initializeUI() {
  // Connect to background script
  port = chrome.runtime.connect({ name: 'panel' });
  
  // Listen for state updates
  port.onMessage.addListener((msg) => {
    if (msg.type === 'state' && msg.tabId === tabId) {
      updateUI(msg.connected, msg.status);
    }
  });
  
  // Subscribe to state updates for this tab
  port.postMessage({ type: 'subscribe', tabId });
  
  // Add mock messages
  messages = [...mockMessages];
  renderMessages();
  
  // Set mock console count
  consoleLogCount = 42;
  updateConsoleCount();
  
  // Event listeners
  document.getElementById('toggle').addEventListener('change', handleToggleChange);
  document.getElementById('clear-logs').addEventListener('click', handleClearLogs);
  document.getElementById('messages-list').addEventListener('click', handleMessageClick);
  document.addEventListener('keydown', handleKeyDown);
  
  // Resize handle
  initializeResizeHandle();
}

// Update UI based on connection state
function updateUI(connected, status = 'disconnected') {
  const toggle = document.getElementById('toggle');
  const toggleContainer = toggle.parentElement;
  const statusEl = document.getElementById('status');
  const statusText = statusEl.querySelector('.status-text');
  const tabInfo = document.getElementById('tab-info');
  
  // Remove existing classes
  statusEl.classList.remove('connected', 'disconnected', 'retrying');
  toggleContainer.classList.remove('connected', 'disconnected', 'retrying');
  
  switch (status) {
    case 'connected':
      toggle.checked = true;
      toggle.disabled = false;
      statusEl.classList.add('connected');
      toggleContainer.classList.add('connected');
      statusText.textContent = 'Connected';
      tabInfo.textContent = `Tab: ${tabId} - Connected`;
      break;
      
    case 'retrying':
      toggle.checked = true;
      toggle.disabled = false;
      statusEl.classList.add('retrying');
      toggleContainer.classList.add('retrying');
      statusText.textContent = 'Retrying...';
      tabInfo.textContent = `Tab: ${tabId} - Reconnecting`;
      break;
      
    case 'disconnected':
    default:
      toggle.checked = false;
      toggle.disabled = false;
      statusEl.classList.add('disconnected');
      toggleContainer.classList.add('disconnected');
      statusText.textContent = 'Disconnected';
      tabInfo.textContent = 'Tab: Not connected';
      break;
  }
}

// Render messages
function renderMessages() {
  const messagesList = document.getElementById('messages-list');
  const emptyState = document.getElementById('empty-state');
  
  if (messages.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  messagesList.innerHTML = '';
  
  messages.forEach((msg, index) => {
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    if (index === selectedMessageIndex) {
      messageEl.classList.add('selected');
    }
    
    const arrow = msg.direction === 'outgoing' ? '↑' : '↓';
    const arrowClass = msg.direction === 'outgoing' ? 'outgoing' : 'incoming';
    
    const dataText = msg.type === 'command' 
      ? `${msg.data.type}(${JSON.stringify(msg.data.params || {}).slice(0, 50)}...)`
      : `Response: ${JSON.stringify(msg.data).slice(0, 60)}...`;
    
    messageEl.innerHTML = `
      <div class="message-data">
        <span class="message-arrow ${arrowClass}">${arrow}</span>
        ${dataText}
      </div>
      <div class="message-time">${formatTime(msg.timestamp)}</div>
    `;
    
    messageEl.dataset.index = index;
    messagesList.appendChild(messageEl);
  });
  
  // Scroll to bottom
  messagesList.scrollTop = messagesList.scrollHeight;
}

// Format timestamp
function formatTime(date) {
  return date.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Handle message click
function handleMessageClick(e) {
  const messageEl = e.target.closest('.message');
  if (!messageEl) return;
  
  const index = parseInt(messageEl.dataset.index);
  selectMessage(index);
}

// Select message
function selectMessage(index) {
  selectedMessageIndex = index;
  
  // Update selected state
  document.querySelectorAll('.message').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });
  
  // Show detail view
  const detailContainer = document.getElementById('detail-container');
  const detailContent = document.getElementById('detail-content');
  
  if (index >= 0 && index < messages.length) {
    detailContainer.classList.add('visible');
    const message = messages[index];
    
    // Format JSON with syntax highlighting (simplified)
    detailContent.textContent = JSON.stringify(message, null, 2);
  } else {
    detailContainer.classList.remove('visible');
  }
}

// Handle keyboard navigation
function handleKeyDown(e) {
  if (e.key === 'ArrowUp' && selectedMessageIndex > 0) {
    selectMessage(selectedMessageIndex - 1);
    e.preventDefault();
  } else if (e.key === 'ArrowDown' && selectedMessageIndex < messages.length - 1) {
    selectMessage(selectedMessageIndex + 1);
    e.preventDefault();
  } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    // Clear messages
    messages = [];
    renderMessages();
    e.preventDefault();
  }
}

// Handle toggle change
function handleToggleChange(e) {
  const checked = e.target.checked;
  
  chrome.runtime.sendMessage(
    { 
      type: checked ? 'connect' : 'disconnect',
      tabId: tabId
    },
    (response) => {
      if (response?.error) {
        console.error('Toggle error:', response.error);
      }
    }
  );
}

// Handle clear logs
function handleClearLogs() {
  consoleLogCount = 0;
  updateConsoleCount();
}

// Update console count
function updateConsoleCount() {
  document.getElementById('console-count').textContent = `Console: ${consoleLogCount}`;
}

// Initialize resize handle
function initializeResizeHandle() {
  const resizeHandle = document.getElementById('resize-handle');
  const detailContainer = document.getElementById('detail-container');
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startY = e.clientY;
    startHeight = detailContainer.offsetHeight;
    document.body.style.cursor = 'ns-resize';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const deltaY = startY - e.clientY;
    const newHeight = Math.min(Math.max(100, startHeight + deltaY), 500);
    detailContainer.style.height = `${newHeight}px`;
  });
  
  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = '';
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeUI);