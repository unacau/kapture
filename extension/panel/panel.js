// Kapture DevTools Panel - Main script

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = statusIndicator.querySelector('.status-text');
const statusDot = statusIndicator.querySelector('.status-dot');
const tabIdElement = document.getElementById('tab-id');
const connectBtn = document.getElementById('connect-btn');
const messagesList = document.getElementById('messages-list');
const detailView = document.getElementById('detail-view');
const logCountElement = document.getElementById('log-count');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const headerClearBtn = document.getElementById('header-clear-btn');

// State
let ws = null;
let isConnected = false;
let isRetrying = false;
let retryInterval = null;
let tabId = null;
let previousTabId = null;  // Store previous tab ID for reconnection
let commandExecutor = null;
let commandQueue = null;
let messages = [];
let selectedMessageIndex = null;


// Update UI state
function updateConnectionStatus(connected, retrying = false) {
  isConnected = connected;
  isRetrying = retrying;
  
  if (connected) {
    statusIndicator.classList.add('connected');
    statusIndicator.classList.remove('retrying');
    statusText.textContent = 'Connected';
    connectBtn.innerHTML = 'Disconnect';
    connectBtn.classList.add('connected');
    connectBtn.classList.remove('connecting');
  } else if (retrying) {
    statusIndicator.classList.remove('connected');
    statusIndicator.classList.add('retrying');
    statusText.textContent = 'Retrying Connection';
    connectBtn.innerHTML = '<span class="spinner"></span>Connecting';
    connectBtn.classList.remove('connected');
    connectBtn.classList.add('connecting');
    tabIdElement.textContent = 'Tab: -';
  } else {
    statusIndicator.classList.remove('connected');
    statusIndicator.classList.remove('retrying');
    statusText.textContent = 'Disconnected';
    connectBtn.innerHTML = 'Connect';
    connectBtn.classList.remove('connected');
    connectBtn.classList.remove('connecting');
    tabIdElement.textContent = 'Tab: -';
  }
}

// Add message to list
function addMessage(direction, data) {
  const timestamp = new Date();
  const message = {
    direction,
    data,
    timestamp
  };
  
  messages.push(message);
  
  // Remove empty state if present
  const emptyState = messagesList.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
  
  // Create message row
  const row = document.createElement('div');
  row.className = `message-row ${direction}`;
  row.dataset.index = messages.length - 1;
  
  const arrow = document.createElement('div');
  arrow.className = 'message-arrow';
  arrow.textContent = direction === 'outgoing' ? '↑' : '↓';
  
  const messageData = document.createElement('div');
  messageData.className = 'message-data';
  messageData.textContent = JSON.stringify(data);
  
  const messageTime = document.createElement('div');
  messageTime.className = 'message-time';
  messageTime.textContent = formatTime(timestamp);
  
  row.appendChild(arrow);
  row.appendChild(messageData);
  row.appendChild(messageTime);
  
  // Add click handler
  row.addEventListener('click', () => selectMessage(parseInt(row.dataset.index)));
  
  messagesList.appendChild(row);
  
  // Auto-scroll to bottom
  messagesList.scrollTop = messagesList.scrollHeight;
}

// Format timestamp
function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

// Select message and show details
function selectMessage(index) {
  // Update selected state
  const rows = messagesList.querySelectorAll('.message-row');
  rows.forEach(row => row.classList.remove('selected'));
  
  if (index >= 0 && index < messages.length) {
    rows[index].classList.add('selected');
    selectedMessageIndex = index;
    
    // Show detail view
    const message = messages[index];
    let detailHTML = `<pre class="detail-content">${JSON.stringify(message.data, null, 2)}</pre>`;
    
    // Check if this is a screenshot response
    if (message.data && 
        message.data.type === 'response' && 
        message.data.success && 
        message.data.result && 
        message.data.result.dataUrl && 
        message.data.result.dataUrl.startsWith('data:image/')) {
      // Add thumbnail for screenshot
      detailHTML += `
        <div class="screenshot-preview">
          <img src="${message.data.result.dataUrl}" 
               alt="Screenshot: ${message.data.result.name || 'Screenshot'}"
               title="Click to open in new tab"
               class="screenshot-thumbnail">
        </div>
      `;
    }
    
    detailView.innerHTML = detailHTML;
    detailView.classList.add('active');
    
    // Add click handler for screenshot thumbnails
    const thumbnail = detailView.querySelector('.screenshot-thumbnail');
    if (thumbnail) {
      thumbnail.addEventListener('click', async () => {
        try {
          // Convert data URL to blob
          const response = await fetch(thumbnail.src);
          const blob = await response.blob();
          
          // Create blob URL
          const blobUrl = URL.createObjectURL(blob);
          
          // Open in new tab
          const newTab = window.open(blobUrl, '_blank');
          
          // Clean up blob URL after a delay
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
          }, 1000);
        } catch (error) {
          console.error('Failed to open screenshot:', error);
        }
      });
    }
  } else {
    selectedMessageIndex = null;
    detailView.classList.remove('active');
    detailView.innerHTML = '';
  }
}

// Get current tab info
async function getCurrentTabInfo() {
  return new Promise((resolve) => {
    if (!chrome.devtools || !chrome.devtools.inspectedWindow) {
      console.error('DevTools API not available');
      resolve(null);
      return;
    }
    
    chrome.devtools.inspectedWindow.eval(
      "({ url: window.location.href, title: document.title })",
      (result, error) => {
        if (error) {
          console.error('Failed to get tab info:', error);
          resolve(null);
        } else {
          // Add the tab ID from the DevTools API
          result.id = chrome.devtools.inspectedWindow.tabId;
          resolve(result);
        }
      }
    );
  });
}

// Connect to WebSocket server
async function connect(fromRetry = false) {
  if (isConnected || ws) {
    return;
  }
  
  // Only stop retrying if this is a manual connect
  if (!fromRetry) {
    stopRetrying();
  }
  
  try {
    // Get current tab info (optional - don't fail if unavailable)
    let tabInfo = await getCurrentTabInfo();
    if (!tabInfo) {
      // Use defaults if tab info is not available
      tabInfo = {
        url: 'unknown',
        title: 'unknown'
      };
    }
    
    // Create WebSocket connection
    ws = new WebSocket('ws://localhost:61822');
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      // Stop retrying if we were
      stopRetrying();
      
      // Register this tab (request previous ID if we have one)
      const registerMessage = {
        type: 'register',
        url: tabInfo.url,
        title: tabInfo.title
      };
      
      // Include previous tab ID if reconnecting
      if (previousTabId) {
        registerMessage.requestedTabId = previousTabId;
      }
      
      ws.send(JSON.stringify(registerMessage));
      addMessage('outgoing', registerMessage);
      
      // Initialize command executor and queue
      commandExecutor = new CommandExecutor();
      commandQueue = new CommandQueue(commandExecutor);
      
      // Update log count periodically
      setInterval(updateLogCount, 1000);
    };
    
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        
        addMessage('incoming', message);
        
        if (message.type === 'registered') {
          // Server has assigned us a tab ID
          tabId = message.tabId;
          previousTabId = tabId;  // Store for reconnection
          tabIdElement.textContent = `Tab: ${tabId}`;
          updateConnectionStatus(true);
          
        } else if (message.type === 'command') {
          // Execute command
          try {
            const result = await commandQueue.enqueue(message);
            ws.send(JSON.stringify(result));
            addMessage('outgoing', result);
          } catch (error) {
            // If error is already a formatted response, use it directly
            if (error && error.type === 'response' && error.success === false) {
              ws.send(JSON.stringify(error));
              addMessage('outgoing', error);
            } else {
              // Otherwise create a generic error response
              const errorResponse = {
                id: message.id,
                type: 'response',
                success: false,
                error: {
                  message: error.message || String(error),
                  code: 'EXECUTION_ERROR'
                }
              };
              ws.send(JSON.stringify(errorResponse));
              addMessage('outgoing', errorResponse);
            }
          }
        }
      } catch (error) {
        console.error('Failed to handle message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Don't call disconnect here as onclose will handle it
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      const shouldRetry = !isConnected && retryInterval !== null;
      disconnect(shouldRetry);
      // Start automatic retry if not already retrying
      if (!retryInterval) {
        startRetrying();
      }
    };
    
  } catch (error) {
    console.error('Connection failed:', error);
    const shouldRetry = retryInterval !== null;
    disconnect(shouldRetry);
    // Start automatic retry after failed connection if not already retrying
    if (!retryInterval) {
      startRetrying();
    }
  }
}

// Disconnect from WebSocket
function disconnect(maintainRetryState = false) {
  if (ws) {
    ws.close();
    ws = null;
  }
  
  // Only update status if we're not maintaining retry state
  if (!maintainRetryState) {
    updateConnectionStatus(false, false);
  }
  
  commandExecutor = null;
  commandQueue = null;
}

// Start automatic retry
function startRetrying() {
  if (retryInterval) return; // Already retrying
  
  console.log('Starting automatic retry...');
  updateConnectionStatus(false, true);
  
  // Try to connect immediately
  connect(true);
  
  // Then retry every 2 seconds
  retryInterval = setInterval(() => {
    if (!isConnected && !ws) {
      console.log('Retrying connection...');
      connect(true);
    }
  }, 2000);
}

// Stop automatic retry
function stopRetrying() {
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
  updateConnectionStatus(false, false);
}

// Update log count display
function updateLogCount() {
  if (commandExecutor) {
    const logCount = commandExecutor.consoleLogBuffer.length;
    logCountElement.textContent = `Log length: ${logCount}`;
  } else {
    logCountElement.textContent = `Log length: 0`;
  }
}

// Clear messages
function clearMessages() {
  messages = [];
  messagesList.innerHTML = '<div class="empty-state">No messages yet. Click Connect to start.</div>';
  detailView.classList.remove('active');
  detailView.innerHTML = '';
  selectedMessageIndex = null;
}

// Clear console logs
function clearLogs() {
  if (commandExecutor) {
    commandExecutor.clearLogs();
    updateLogCount();
  }
}

// Connect button handler
connectBtn.addEventListener('click', () => {
  if (isConnected) {
    stopRetrying();
    disconnect();
  } else if (isRetrying) {
    stopRetrying();
  } else {
    // Start retrying which will attempt immediate connection
    startRetrying();
  }
});

// Clear button handlers
clearLogsBtn.addEventListener('click', clearLogs);
headerClearBtn.addEventListener('click', clearMessages);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Cmd+K or Ctrl+K to clear messages
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    clearMessages();
  }
  // Cmd+L or Ctrl+L to clear console logs  
  else if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
    e.preventDefault();
    clearLogs();
  }
});

// Initialize
updateConnectionStatus(false);
updateLogCount();

// Send tab info update to server
function sendTabInfoUpdate(url, title) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const updateMessage = {
      type: 'tab-info',
      url: url,
      title: title
    };
    ws.send(JSON.stringify(updateMessage));
    console.log('Sent tab info update:', updateMessage);
  }
}

// Export for command executor
window.sendTabInfoUpdate = sendTabInfoUpdate;