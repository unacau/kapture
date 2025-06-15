// Renderer process for Kapture MCP Test Client
let connected = false;
let currentTools = [];
let currentTabs = [];
let selectedTabId = null;
let tabPollingInterval = null;

// DOM elements
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const refreshTabsBtn = document.getElementById('refresh-tabs');
const tabListEl = document.getElementById('tab-list');
const tabContentEl = document.getElementById('tab-content');
const consoleEl = document.getElementById('console-output');

// Tool forms state - store form data per tab
const tabFormData = {};

// Logging
function log(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `console-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Server management
async function connectToServer() {
  try {
    log('Connecting to MCP server...');
    statusTextEl.textContent = 'Connecting...';

    const result = await window.electronAPI.connectMCP();

    if (result.success) {
      connected = true;
      statusEl.classList.add('connected');
      
      // Get the port number
      const port = await window.electronAPI.getPort();
      statusTextEl.textContent = `Server Running (Port ${port})`;
      refreshTabsBtn.disabled = false;

      log(`MCP server connected successfully on port ${port}`, 'info');
      log(`Server capabilities: ${JSON.stringify(result.capabilities)}`, 'info');

      // Auto-discover tools
      await discoverTools();
      await refreshTabs();

      // Start polling for tabs if none found
      startTabPolling();
    } else {
      throw new Error(result.error || 'Failed to connect to server');
    }
  } catch (error) {
    log(`Failed to connect to server: ${error.message}`, 'error');
    connected = false;
    statusEl.classList.remove('connected');
    statusTextEl.textContent = 'Connection Failed';
    refreshTabsBtn.disabled = true;

    // Don't retry if user cancelled killing existing process
    if (!error.message.includes('still in use')) {
      // Retry connection after delay
      setTimeout(() => {
        log('Retrying connection...');
        connectToServer();
      }, 3000);
    }
  }
}

// Tool discovery
async function discoverTools() {
  try {
    log('Discovering available tools...');
    const response = await window.electronAPI.sendMCPRequest('tools/list');
    currentTools = response.tools || [];
    log(`Found ${currentTools.length} tools`);
  } catch (error) {
    log(`Failed to discover tools: ${error.message}`, 'error');
  }
}

// Tab polling management
function startTabPolling() {
  // Don't start if already polling
  if (tabPollingInterval) return;

  // Only poll if no tabs are connected
  if (currentTabs.length === 0) {
    log('Starting automatic tab discovery...');
    tabPollingInterval = setInterval(async () => {
      // Only poll if still connected and no tabs
      if (connected && currentTabs.length === 0) {
        await refreshTabs(true); // true = silent mode
      } else {
        stopTabPolling();
      }
    }, 1000);
  }
}

function stopTabPolling() {
  if (tabPollingInterval) {
    clearInterval(tabPollingInterval);
    tabPollingInterval = null;
    log('Stopped automatic tab discovery');
  }
}

// Tab management
refreshTabsBtn.addEventListener('click', () => refreshTabs(false));

async function refreshTabs(silent = false) {
  try {
    if (!silent) {
      log('Refreshing tabs...');
    }
    const result = await callTool('kapturemcp_list_tabs', {});
    const content = JSON.parse(result.content[0].text);
    const newTabs = content.tabs || [];

    // Show MCP client info if available
    if (content.mcpClient && content.mcpClient.name) {
      const clientInfo = `${content.mcpClient.name} v${content.mcpClient.version || '?'}`;
      if (!silent) {
        log(`MCP Client: ${clientInfo}`);
      }
    }

    // Check if we found new tabs
    if (currentTabs.length === 0 && newTabs.length > 0) {
      log(`Found ${newTabs.length} connected tab${newTabs.length > 1 ? 's' : ''}!`);
      stopTabPolling();
    } else if (!silent) {
      log(`Found ${newTabs.length} connected tabs`);
    }

    currentTabs = newTabs;
    displayTabs();

    // Auto-select first tab if none selected
    if (!selectedTabId && currentTabs.length > 0) {
      selectTab(currentTabs[0].tabId);
    } else if (selectedTabId) {
      // Update tab content if already selected
      displayTabContent();
    }

    // If selected tab is gone, clear selection
    if (selectedTabId && !currentTabs.find(t => t.tabId === selectedTabId)) {
      selectedTabId = null;
      displayTabContent();
    }

    // If no tabs, start polling
    if (currentTabs.length === 0) {
      startTabPolling();
    }
  } catch (error) {
    if (!silent) {
      log(`Failed to refresh tabs: ${error.message}`, 'error');
    }
    currentTabs = [];
    displayTabs();
    startTabPolling();
  }
}

function displayTabs() {
  tabListEl.innerHTML = '';

  if (currentTabs.length === 0) {
    tabListEl.innerHTML = '<div class="empty-state" style="padding: 0.5rem;">Looking for Chrome tabs...</div>';
    return;
  }

  currentTabs.forEach(tab => {
    const tabEl = document.createElement('button');
    tabEl.className = 'tab-item';
    if (tab.tabId === selectedTabId) {
      tabEl.classList.add('active');
    }

    tabEl.innerHTML = `<span class="tab-title">${tab.title || 'Untitled'}</span>`;

    tabEl.addEventListener('click', () => selectTab(tab.tabId));
    tabListEl.appendChild(tabEl);
  });
}

function selectTab(tabId) {
  selectedTabId = tabId;
  displayTabs();
  displayTabContent();
}

function displayTabContent() {
  if (!selectedTabId) {
    tabContentEl.innerHTML = `
      <div class="empty-state">
        <p>No tab selected</p>
        <p class="hint">Select a tab above to see available tools</p>
      </div>
    `;
    return;
  }

  // Get current tab info
  const currentTab = currentTabs.find(t => t.tabId === selectedTabId);
  const currentUrl = currentTab ? currentTab.url : '';

  // Create browser navigation bar
  const navBarHtml = `
    <div class="browser-nav-bar">
      <button class="nav-btn" id="nav-back" title="Go back">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path fill="currentColor" d="M11 2L5 8l6 6v-12z"/>
        </svg>
      </button>
      <button class="nav-btn" id="nav-forward" title="Go forward">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path fill="currentColor" d="M5 2l6 6-6 6V2z"/>
        </svg>
      </button>
      <input type="text" class="nav-url-input" id="nav-url" value="${currentUrl}" placeholder="Enter URL...">
      <button class="nav-btn nav-refresh" id="nav-refresh" title="Navigate">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path fill="currentColor" d="M12 8l-6-6v4H2v4h4v4l6-6z"/>
        </svg>
      </button>
    </div>
  `;

  // Create tool cards (excluding navigation tools)
  const toolsHtml = currentTools
    .filter(tool => !['kapturemcp_list_tabs', 'kapturemcp_navigate', 'kapturemcp_go_back', 'kapturemcp_go_forward'].includes(tool.name))
    .map(tool => createToolCard(tool))
    .join('');

  tabContentEl.innerHTML = `
    ${navBarHtml}
    <div class="tools-grid">${toolsHtml}</div>
  `;

  // Add navigation event listeners
  document.getElementById('nav-back').addEventListener('click', async () => {
    await executeNavigation('back');
  });

  document.getElementById('nav-forward').addEventListener('click', async () => {
    await executeNavigation('forward');
  });

  const urlInput = document.getElementById('nav-url');
  const navRefresh = document.getElementById('nav-refresh');

  const navigateToUrl = async () => {
    const url = urlInput.value.trim();
    if (url) {
      await executeNavigation('navigate', url);
    }
  };

  urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      navigateToUrl();
    }
  });

  navRefresh.addEventListener('click', navigateToUrl);

  // Restore form data if exists
  if (tabFormData[selectedTabId]) {
    Object.entries(tabFormData[selectedTabId]).forEach(([toolName, params]) => {
      Object.entries(params).forEach(([paramName, value]) => {
        if (paramName === 'format') {
          // For radio buttons, find and check the matching one
          const radio = document.querySelector(`input[name="${toolName}-${paramName}"][value="${value}"]`);
          if (radio) radio.checked = true;
        } else {
          const input = document.getElementById(`${toolName}-${paramName}`);
          if (input) input.value = value;
        }
      });
    });
  }

  // Add event listeners
  addToolEventListeners();
}

function createToolCard(tool) {
  const params = tool.inputSchema?.properties || {};
  const required = tool.inputSchema?.required || [];

  const paramsHtml = Object.entries(params)
    .filter(([name]) => name !== 'tabId')
    .map(([name, schema]) => {
      const isRequired = required.includes(name);
      const inputId = `${tool.name}-${name}`;

      let inputHtml = '';
      if (schema.type === 'string' && name === 'code') {
        inputHtml = `<textarea id="${inputId}" ${isRequired ? 'required' : ''}></textarea>`;
      } else if (schema.type === 'number') {
        const min = schema.minimum !== undefined ? `min="${schema.minimum}"` : '';
        const max = schema.maximum !== undefined ? `max="${schema.maximum}"` : '';
        const step = name === 'scale' || name === 'quality' ? 'step="0.1"' : '';
        const defaultValue = schema.default !== undefined ? `value="${schema.default}"` : '';
        inputHtml = `<input type="number" id="${inputId}" ${isRequired ? 'required' : ''} ${min} ${max} ${step} ${defaultValue}>`;
      } else if (name === 'format' && schema.enum) {
        // Create radio buttons for format selection
        inputHtml = `<div class="radio-group">`;
        schema.enum.forEach(format => {
          const isDefault = schema.default === format;
          inputHtml += `
            <label class="radio-label">
              <input type="radio" name="${inputId}" value="${format}" ${isDefault ? 'checked' : ''}>
              <span>${format.toUpperCase()}</span>
            </label>
          `;
        });
        inputHtml += `</div>`;
      } else {
        inputHtml = `<input type="text" id="${inputId}" ${isRequired ? 'required' : ''}>`;
      }

      return `
        <div class="param-group">
          <label for="${inputId}">
            ${name} ${isRequired ? '<span style="color: #e74c3c;">*</span>' : ''}
          </label>
          ${inputHtml}
        </div>
      `;
    }).join('');

  return `
    <div class="tool-card">
      <h3>${tool.name}</h3>
      <p class="description">${tool.description}</p>
      <div class="tool-params">
        ${paramsHtml || '<p style="color: #999; font-size: 0.85rem;">No parameters needed</p>'}
      </div>
      <button class="tool-execute" data-tool="${tool.name}">Execute</button>
      <details id="result-${tool.name}" class="tool-result" style="display: none;">
        <summary></summary>
        <pre class="result-content"></pre>
      </details>
    </div>
  `;
}

function addToolEventListeners() {
  // Save form data on input
  tabContentEl.querySelectorAll('input, textarea').forEach(input => {
    const eventType = input.type === 'radio' ? 'change' : 'input';
    input.addEventListener(eventType, () => {
      if (input.type === 'radio') {
        // For radio buttons, extract tool and param name from the name attribute
        const [toolName, paramName] = input.name.split('-');
        if (!tabFormData[selectedTabId]) {
          tabFormData[selectedTabId] = {};
        }
        if (!tabFormData[selectedTabId][toolName]) {
          tabFormData[selectedTabId][toolName] = {};
        }
        tabFormData[selectedTabId][toolName][paramName] = input.value;
      } else {
        // For other inputs, use the id attribute
        const [toolName, paramName] = input.id.split('-');
        if (!tabFormData[selectedTabId]) {
          tabFormData[selectedTabId] = {};
        }
        if (!tabFormData[selectedTabId][toolName]) {
          tabFormData[selectedTabId][toolName] = {};
        }
        tabFormData[selectedTabId][toolName][paramName] = input.value;
      }
    });
  });

  // Execute buttons
  tabContentEl.querySelectorAll('.tool-execute').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const toolName = e.target.dataset.tool;
      await executeTool(toolName, e.target);
    });
  });
}

async function executeTool(toolName, button) {
  const tool = currentTools.find(t => t.name === toolName);
  if (!tool) return;

  const resultEl = document.getElementById(`result-${toolName}`);
  const summaryEl = resultEl.querySelector('summary');
  const contentEl = resultEl.querySelector('.result-content');

  try {
    // Check if tab is selected
    if (!selectedTabId) {
      throw new Error('Please select a tab first');
    }

    button.disabled = true;
    button.textContent = 'Executing...';
    resultEl.style.display = 'block';
    resultEl.className = 'tool-result';
    summaryEl.textContent = 'Executing...';
    contentEl.textContent = '';

    // Gather parameters
    const params = { tabId: selectedTabId };

    const paramProps = tool.inputSchema?.properties || {};
    Object.keys(paramProps).forEach(name => {
      if (name === 'tabId') return;

      if (name === 'format' && paramProps[name].enum) {
        // For radio buttons, find the checked one
        const checkedRadio = document.querySelector(`input[name="${toolName}-${name}"]:checked`);
        if (checkedRadio) {
          params[name] = checkedRadio.value;
        }
      } else {
        const input = document.getElementById(`${toolName}-${name}`);
        if (input && input.value) {
          if (paramProps[name].type === 'number') {
            params[name] = parseFloat(input.value);
          } else {
            params[name] = input.value;
          }
        }
      }
    });

    log(`Executing ${toolName} with params: ${JSON.stringify(params)}`);

    const result = await callTool(toolName, params);

    resultEl.className = 'tool-result success';

    // Parse and display result
    if (result.content && result.content[0]) {
      let content;
      try {
        content = JSON.parse(result.content[0].text);
      } catch (parseError) {
        // If JSON parsing fails, it might be a plain error message
        throw new Error(result.content[0].text || 'Unknown error');
      }

      // Set summary based on content
      if (content.error) {
        summaryEl.textContent = `❌ ${content.error.message || 'Command failed'}`;
        resultEl.className = 'tool-result error';
      } else if (content.clicked === false || content.hovered === false || content.filled === false || content.selected === false) {
        summaryEl.textContent = '⚠️ Element not found';
        resultEl.className = 'tool-result warning';
      } else if (toolName === 'kapturemcp_screenshot') {
        summaryEl.textContent = '✅ Screenshot captured';
      } else if (toolName === 'kapturemcp_click') {
        summaryEl.textContent = '✅ Clicked successfully';
      } else if (toolName === 'kapturemcp_hover') {
        summaryEl.textContent = '✅ Hovered successfully';
      } else if (toolName === 'kapturemcp_fill') {
        summaryEl.textContent = '✅ Filled successfully';
      } else if (toolName === 'kapturemcp_select') {
        summaryEl.textContent = '✅ Selected successfully';
      } else if (toolName === 'kapturemcp_logs') {
        summaryEl.textContent = `✅ Retrieved ${content.logs?.length || 0} logs`;
      } else if (toolName === 'kapturemcp_evaluate') {
        summaryEl.textContent = '✅ Evaluated successfully';
      } else if (toolName === 'kapturemcp_dom') {
        summaryEl.textContent = '✅ DOM retrieved';
      } else {
        summaryEl.textContent = '✅ Success';
      }

      contentEl.textContent = JSON.stringify(content, null, 2);

      // Update local tab info if we got new URL/title
      if (content.url && content.title && selectedTabId) {
        const tab = currentTabs.find(t => t.tabId === selectedTabId);
        if (tab && (tab.url !== content.url || tab.title !== content.title)) {
          tab.url = content.url;
          tab.title = content.title;

          // Update UI immediately
          displayTabs();

          // Update URL input if it exists
          const urlInput = document.getElementById('nav-url');
          if (urlInput) {
            urlInput.value = content.url;
          }

          log(`Tab info updated: ${content.title}`);
        }
      }

      // Special handling for screenshots
      if (content.dataUrl) {
        // Remove any existing screenshot preview
        const existingPreview = resultEl.parentNode.querySelector('.screenshot-preview');
        if (existingPreview) {
          existingPreview.remove();
        }

        const img = document.createElement('div');
        img.className = 'screenshot-preview';
        const scaleInfo = content.scale && content.scale < 1 ? ` (scaled to ${content.scale * 100}%)` : '';
        const formatInfo = content.format ? ` (${content.format.toUpperCase()})` : '';
        img.innerHTML = `
          <img src="${content.dataUrl}" alt="Screenshot">
          <div style="text-align: center; margin-top: 0.5rem; font-size: 0.85rem; color: #666;">
            Screenshot captured${scaleInfo}${formatInfo}
          </div>
        `;
        // Insert after the details element
        resultEl.parentNode.insertBefore(img, resultEl.nextSibling);
      }
    } else {
      summaryEl.textContent = '✅ Success';
      contentEl.textContent = JSON.stringify(result, null, 2);
    }

    log(`${toolName} executed successfully`);
  } catch (error) {
    resultEl.className = 'tool-result error';
    let errorMessage = error.message;

    // Check for common error patterns
    if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
      errorMessage = 'Tab not found. Please refresh tabs and try again.';
    } else if (errorMessage.includes('not connected')) {
      errorMessage = 'MCP server not connected. Please connect first.';
    } else if (errorMessage.includes('Please select a tab first')) {
      errorMessage = 'No tab selected. Please select a tab from the list above.';
    }

    summaryEl.textContent = `❌ ${errorMessage}`;
    contentEl.textContent = error.stack || error.message;
    log(`${toolName} failed: ${errorMessage}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Execute';
  }
}

async function callTool(name, args) {
  return await window.electronAPI.sendMCPRequest('tools/call', {
    name,
    arguments: args
  });
}

// Execute navigation commands
async function executeNavigation(action, url = null) {
  try {
    let toolName, params;

    switch (action) {
      case 'back':
        toolName = 'kapturemcp_go_back';
        params = { tabId: selectedTabId };
        log('Navigating back...');
        break;
      case 'forward':
        toolName = 'kapturemcp_go_forward';
        params = { tabId: selectedTabId };
        log('Navigating forward...');
        break;
      case 'navigate':
        toolName = 'kapturemcp_navigate';
        params = { tabId: selectedTabId, url };
        log(`Navigating to ${url}...`);
        break;
    }

    const result = await callTool(toolName, params);
    const content = JSON.parse(result.content[0].text);

    if (content.error) {
      log(`Navigation failed: ${content.error.message}`, 'error');
    } else {
      log(`Navigation completed`);

      // Update local tab info if we got new URL/title
      if (content.url && content.title) {
        const tab = currentTabs.find(t => t.tabId === selectedTabId);
        if (tab) {
          tab.url = content.url;
          tab.title = content.title;

          // Update UI immediately
          displayTabs();

          // Update URL input
          const urlInput = document.getElementById('nav-url');
          if (urlInput) {
            urlInput.value = content.url;
          }
        }
      }
    }
  } catch (error) {
    log(`Navigation error: ${error.message}`, 'error');
  }
}

// Clear console
document.getElementById('clear-console').addEventListener('click', () => {
  consoleEl.innerHTML = '';
});

// Listen for MCP notifications
window.electronAPI.onMCPNotification((message) => {
  if (message.method === 'log' && message.params) {
    log(message.params.message, message.params.type || 'info');
  } else if (message.method === 'kapturemcp/tab_disconnected' && message.params) {
    // Handle tab disconnection notification
    const { tabId } = message.params;
    log(`Tab ${tabId} disconnected`, 'warning');

    // Remove tab from current tabs
    currentTabs = currentTabs.filter(tab => tab.tabId !== tabId);

    // If this was the selected tab, clear selection
    if (selectedTabId === tabId) {
      selectedTabId = null;
      displayTabContent();
    }

    // Update UI
    displayTabs();

    // Start polling if no tabs left
    if (currentTabs.length === 0) {
      startTabPolling();
    }
  } else {
    log(`Notification: ${message.method}`, 'info');
  }
});

window.electronAPI.onMCPDisconnected((data) => {
  log(`MCP server disconnected (code: ${data.code})`, 'error');
  connected = false;
  statusEl.classList.remove('connected');
  statusTextEl.textContent = 'Disconnected';
  refreshTabsBtn.disabled = true;

  // Stop polling
  stopTabPolling();

  // Clear tabs and content
  currentTabs = [];
  selectedTabId = null;
  displayTabs();

  // Attempt to reconnect
  setTimeout(() => {
    log('Attempting to reconnect...');
    connectToServer();
  }, 2000);
});

window.electronAPI.onMCPError((data) => {
  if (data.type === 'PORT_IN_USE') {
    log(data.message, 'error');
    alert('Port 61822 is already in use!\n\nPlease stop any running Kapture server instances:\n- Check for other terminal windows running "npm start"\n- Check for other Electron test app instances\n- Use "lsof -i :61822" to find the process');
    connected = false;
    statusEl.classList.remove('connected');
    statusTextEl.textContent = 'Port In Use';
    refreshTabsBtn.disabled = true;
  } else {
    log(`Server error: ${data.message}`, 'error');
  }
});

// Initial state
log('Kapture MCP Test Client ready');

// Auto-connect on startup
connectToServer();
