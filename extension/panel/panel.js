// Kapture DevTools Panel - Main script

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = statusIndicator.querySelector('.status-text');
const statusDot = statusIndicator.querySelector('.status-dot');
const tabIdElement = document.getElementById('tab-id');
const connectBtn = document.getElementById('connect-btn');
const serverDropdown = document.getElementById('server-dropdown');

const messagesList = document.getElementById('messages-list');
const detailView = document.getElementById('detail-view');
const divider = document.getElementById('divider');
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
let isManualDisconnect = false;  // Track if user manually disconnected
let discoveredServers = [];
let selectedPort = 61822;
let discoveryInterval = null;
let connectedServerInfo = null; // Store info about connected server


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
    divider.classList.add('active');

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
    divider.classList.remove('active');
    detailView.innerHTML = '';
  }
}

// Navigate through messages with arrow keys
function navigateMessages(direction) {
  const messageCount = messages.length;
  if (messageCount === 0) return;

  // If no message is selected, start from the beginning or end
  if (selectedMessageIndex === null) {
    selectMessage(direction === -1 ? messageCount - 1 : 0);
    return;
  }

  // Calculate new index
  let newIndex = selectedMessageIndex + direction;

  // Wrap around at boundaries
  if (newIndex < 0) {
    newIndex = messageCount - 1;
  } else if (newIndex >= messageCount) {
    newIndex = 0;
  }

  selectMessage(newIndex);

  // Ensure the selected message is visible
  const rows = messagesList.querySelectorAll('.message-row');
  if (rows[newIndex]) {
    rows[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Server discovery
async function discoverServers() {
  const startPort = 61822;
  const endPort = 61832;
  const discovered = [];

  // Try to fetch from each port in parallel
  const promises = [];
  for (let port = startPort; port <= endPort; port++) {
    promises.push(
      fetch(`http://localhost:${port}/`, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'Accept': 'application/json'
        }
      })
      .then(response => {
        // Only process 200 OK responses
        if (response.ok) {
          return response.json();
        }
        return null;
      })
      .then(data => {
        if (data && data.mcpClient) {
          discovered.push({
            port,
            mcpClient: data.mcpClient,
            label: `${data.mcpClient.name} ${data.mcpClient.version} (${port})`
          });
        }
      })
      .catch(() => {
        // Silently ignore connection failures
      })
    );
  }

  // Wait for all requests to complete
  await Promise.allSettled(promises);

  // Sort discovered servers by port number for stable ordering
  discovered.sort((a, b) => a.port - b.port);
  
  // Update discovered servers
  discoveredServers = discovered;
  
  // If we discovered servers and don't have a port selected, select the first one
  if (discovered.length > 0 && !discoveredServers.find(s => s.port === selectedPort)) {
    selectedPort = discovered[0].port;
  }
  
  updateServerDropdown();

  return discovered.length > 0;
}

// Update server dropdown UI
function updateServerDropdown() {
  // Build list of servers to show
  const serversToShow = [...discoveredServers];
  
  // If connected, ensure the connected server is in the list
  if (connectedServerInfo && isConnected) {
    // Check if connected server is already in discovered list
    const alreadyInList = serversToShow.find(s => s.port === connectedServerInfo.port);
    if (!alreadyInList) {
      // Add connected server to the beginning of the list
      serversToShow.unshift(connectedServerInfo);
    }
  }
  
  // Sort all servers by port for consistent ordering
  serversToShow.sort((a, b) => a.port - b.port);

  // Get current options to check if update is needed
  const currentOptions = Array.from(serverDropdown.options);
  const currentValues = currentOptions.map(opt => opt.value);
  const newValues = serversToShow.map(s => s.port.toString());
  
  // Check if we need to update (different servers or different order)
  const needsUpdate = serversToShow.length === 0 && currentOptions.length > 0 ||
                     serversToShow.length > 0 && currentOptions.length === 0 ||
                     JSON.stringify(currentValues) !== JSON.stringify(newValues) ||
                     currentOptions.some((opt, i) => 
                       serversToShow[i] && opt.textContent !== serversToShow[i].label
                     );
  
  if (!needsUpdate) {
    // Just ensure the selection is correct
    if (selectedPort) {
      serverDropdown.value = selectedPort;
    }
    return;
  }

  // Store whether dropdown is open and current scroll position
  const isOpen = document.activeElement === serverDropdown;
  
  // Clear and rebuild
  serverDropdown.innerHTML = '';

  if (serversToShow.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No servers found';
    serverDropdown.appendChild(option);
    serverDropdown.disabled = true;
  } else {
    serverDropdown.disabled = false;

    // Add all servers to dropdown
    serversToShow.forEach(server => {
      const option = document.createElement('option');
      option.value = server.port;
      option.textContent = server.label;
      serverDropdown.appendChild(option);
    });

    // Select the currently selected port
    if (selectedPort) {
      serverDropdown.value = selectedPort;
    }
  }
  
  // If dropdown was open, keep it open
  if (isOpen) {
    serverDropdown.focus();
  }
}

// Start discovery process
function startDiscovery() {
  // Initial discovery
  discoverServers().then(found => {
    // If we're retrying and found servers, connect to the first one
    if (found && isRetrying && !isConnected) {
      connect(true);
    }
  });

  // Set up interval for continuous discovery
  discoveryInterval = setInterval(async () => {
    // Only discover if not connected
    if (!isConnected) {
      const found = await discoverServers();
      // If we're retrying and found servers, connect
      if (found && isRetrying && !isConnected) {
        connect(true);
      }
    }
  }, 3000);
}

// Stop discovery process
function stopDiscovery() {
  if (discoveryInterval) {
    clearInterval(discoveryInterval);
    discoveryInterval = null;
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
      'window.__kh ? window.__kh.getTabInfo() : ({ url: window.location.href, title: document.title })',
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

  // Reset manual disconnect flag when connecting
  isManualDisconnect = false;

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

    // Stop discovery when connecting
    stopDiscovery();

    // Create WebSocket connection
    ws = new WebSocket(`ws://localhost:${selectedPort}`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Stop retrying if we were
      stopRetrying();

      // Register this tab (request previous ID if we have one)
      const registerMessage = {
        type: 'register',
        url: tabInfo.url,
        title: tabInfo.title,
        domSize: tabInfo.domSize,
        fullPageDimensions: tabInfo.fullPageDimensions,
        viewportDimensions: tabInfo.viewportDimensions
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

          // Store connected server info if provided
          if (message.mcpClient && message.mcpClient.name) {
            connectedServerInfo = {
              port: selectedPort,
              mcpClient: message.mcpClient,
              label: `${message.mcpClient.name} ${message.mcpClient.version || '?'} (${selectedPort})`
            };
          } else {
            connectedServerInfo = null;
          }

          updateConnectionStatus(true);
          // Update dropdown to show connected server
          updateServerDropdown();

        } else if (message.type === 'mcp-client-update') {
          // Update connected server info when MCP client connects later
          if (message.mcpClient && message.mcpClient.name) {
            connectedServerInfo = {
              port: selectedPort,
              mcpClient: message.mcpClient,
              label: `${message.mcpClient.name} ${message.mcpClient.version || '?'} (${selectedPort})`
            };
            // Update dropdown to show the new server info
            updateServerDropdown();
          }

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
      // Start automatic retry only if not manually disconnected
      if (!retryInterval && !isManualDisconnect) {
        startRetrying();
      }
    };

  } catch (error) {
    console.error('Connection failed:', error);
    const shouldRetry = retryInterval !== null;
    disconnect(shouldRetry);
    // Start automatic retry after failed connection only if not manually disconnected
    if (!retryInterval && !isManualDisconnect) {
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
  connectedServerInfo = null; // Clear connected server info

  // Restart discovery when disconnected
  if (!isConnected) {
    startDiscovery();
  }
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
  // If no server is selected but default port exists, use it
  if (!selectedPort && discoveredServers.length === 0) {
    selectedPort = 61822;
  }

  if (isConnected) {
    isManualDisconnect = true;  // Mark as manual disconnect
    stopRetrying();
    disconnect();
  } else if (isRetrying) {
    isManualDisconnect = true;  // Stop retrying is also manual
    stopRetrying();
  } else {
    // Start retrying which will attempt immediate connection
    startRetrying();
  }
});

// Server dropdown handler
serverDropdown.addEventListener('change', (e) => {
  const newPort = parseInt(e.target.value);
  if (newPort && newPort !== selectedPort) {
    selectedPort = newPort;

    // If connected, disconnect and reconnect to new server
    if (isConnected) {
      isManualDisconnect = false; // Auto-reconnect to new server
      stopRetrying();
      disconnect();
      // Small delay before reconnecting
      setTimeout(() => {
        connect(false); // Connect directly without retry UI
      }, 100);
    }
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
  // Arrow key navigation
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    navigateMessages(e.key === 'ArrowUp' ? -1 : 1);
  }
});

// Initialize
updateConnectionStatus(false);
updateLogCount();

// Start server discovery on load
startDiscovery();

// Divider drag functionality
let isDragging = false;
let startY = 0;
let startHeight = 0;

divider.addEventListener('mousedown', (e) => {
  isDragging = true;
  startY = e.clientY;
  startHeight = detailView.offsetHeight;
  divider.classList.add('dragging');

  // Prevent text selection during drag
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;

  const delta = startY - e.clientY;
  const newHeight = Math.max(50, Math.min(startHeight + delta, window.innerHeight - 200));
  detailView.style.height = newHeight + 'px';
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    divider.classList.remove('dragging');
    document.body.style.userSelect = '';
  }
});

// Send tab info update to server
async function sendTabInfoUpdate(url, title) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    // Get current dimensions
    const tabInfo = await getCurrentTabInfo();
    
    const updateMessage = {
      type: 'tab-info',
      url: url,
      title: title,
      domSize: tabInfo ? tabInfo.domSize : undefined,
      fullPageDimensions: tabInfo ? tabInfo.fullPageDimensions : undefined,
      viewportDimensions: tabInfo ? tabInfo.viewportDimensions : undefined
    };
    ws.send(JSON.stringify(updateMessage));
    console.log('Sent tab info update:', updateMessage);
  }
}

// Export for command executor
window.sendTabInfoUpdate = sendTabInfoUpdate;
