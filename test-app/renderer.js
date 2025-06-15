// Renderer process for Kapture MCP Test Client
let connected = false;
let currentTools = [];
let currentResources = [];
let currentTabs = [];
let selectedTabId = null;

// DOM elements
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const refreshTabsBtn = document.getElementById('refresh-tabs');
const tabListEl = document.getElementById('tab-list');
const tabContentEl = document.getElementById('tab-content');
const consoleEl = document.getElementById('console-output');
const tabInfoEl = document.getElementById('tab-info-content');
const consoleDividerEl = document.getElementById('console-divider');
const consoleContainerEl = document.getElementById('console');

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

      // Auto-discover tools and resources
      await discoverTools();
      await discoverResources();
      
      // Don't poll - we'll get notifications when tabs connect
      log('Waiting for tab connections...', 'info');
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

// Resource discovery
async function discoverResources() {
  try {
    log('Discovering available resources...');
    const response = await window.electronAPI.sendMCPRequest('resources/list');
    currentResources = response.resources || [];
    log(`Found ${currentResources.length} resources`);
  } catch (error) {
    log(`Failed to discover resources: ${error.message}`, 'error');
  }
}


// Tab management
refreshTabsBtn.addEventListener('click', () => refreshTabs(false));

async function refreshTabs(silent = false) {
  try {
    if (!silent) {
      log('Querying tabs resource...');
    }
    
    const response = await window.electronAPI.sendMCPRequest('resources/read', {
      uri: 'kapture://tabs'
    });
    
    // Parse the resource data
    const newTabs = response.contents && response.contents[0] 
      ? JSON.parse(response.contents[0].text)
      : [];

    if (!silent) {
      log(`Found ${newTabs.length} connected tabs`);
      // Debug: Log the tab data from manual refresh
      if (newTabs.length > 0) {
        log(`Manual refresh tab data: ${JSON.stringify(newTabs)}`, 'debug');
      }
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
  } catch (error) {
    if (!silent) {
      log(`Failed to query tabs resource: ${error.message}`, 'error');
    }
  }
}

function displayTabs() {
  tabListEl.innerHTML = '';

  if (currentTabs.length === 0) {
    tabListEl.innerHTML = '<div class="empty-state" style="padding: 0.5rem;">Looking for Chrome tabs...</div>';
    return;
  }

  // Debug: Log what we're about to display
  log(`Displaying ${currentTabs.length} tabs`, 'debug');
  
  currentTabs.forEach(tab => {
    const tabEl = document.createElement('button');
    tabEl.className = 'tab-item';
    if (tab.tabId === selectedTabId) {
      tabEl.classList.add('active');
    }

    tabEl.innerHTML = `<span class="tab-title">${tab.title || 'Untitled'}</span>`;
    
    // Add tooltip with tab dimensions
    let tooltipText = `Tab ID: ${tab.tabId}\nURL: ${tab.url || 'Unknown'}`;
    if (tab.domSize) {
      tooltipText += `\nDOM Size: ${(tab.domSize / 1024).toFixed(1)} KB`;
    }
    if (tab.fullPageDimensions) {
      tooltipText += `\nPage Size: ${tab.fullPageDimensions.width}×${tab.fullPageDimensions.height}`;
    }
    if (tab.viewportDimensions) {
      tooltipText += `\nViewport: ${tab.viewportDimensions.width}×${tab.viewportDimensions.height}`;
    }
    tabEl.title = tooltipText;

    tabEl.addEventListener('click', () => selectTab(tab.tabId));
    tabListEl.appendChild(tabEl);
  });
}

function selectTab(tabId) {
  selectedTabId = tabId;
  displayTabs();
  displayTabContent();
  updateTabInfo();
}

function updateTabInfo() {
  const tab = currentTabs.find(t => t.tabId === selectedTabId);
  
  if (!tab) {
    tabInfoEl.innerHTML = '<span class="info-placeholder">No tab selected</span>';
    return;
  }
  
  let infoHTML = '';
  
  // Tab ID
  infoHTML += `<span class="info-item"><span class="info-label">Tab:</span> <span class="info-value">${tab.tabId}</span></span>`;
  
  // URL
  if (tab.url) {
    infoHTML += `<span class="info-item url"><span class="info-label">URL:</span> <span class="info-value" title="${tab.url}">${tab.url}</span></span>`;
  }
  
  // DOM Size
  if (tab.domSize) {
    infoHTML += `<span class="info-item"><span class="info-label">DOM:</span> <span class="info-value">${(tab.domSize / 1024).toFixed(1)} KB</span></span>`;
  }
  
  // Viewport
  if (tab.viewportDimensions) {
    infoHTML += `<span class="info-item"><span class="info-label">Viewport:</span> <span class="info-value">${tab.viewportDimensions.width}×${tab.viewportDimensions.height}</span></span>`;
  }
  
  // Page Size
  if (tab.fullPageDimensions) {
    infoHTML += `<span class="info-item"><span class="info-label">Page:</span> <span class="info-value">${tab.fullPageDimensions.width}×${tab.fullPageDimensions.height}</span></span>`;
  }
  
  // Scroll Position
  if (tab.scrollPosition) {
    infoHTML += `<span class="info-item"><span class="info-label">Scroll:</span> <span class="info-value">${tab.scrollPosition.x}, ${tab.scrollPosition.y}</span></span>`;
  }
  
  // Page Visibility
  if (tab.pageVisibility) {
    const visibleIcon = tab.pageVisibility.visible ? '👁️' : '🚫';
    infoHTML += `<span class="info-item"><span class="info-label">Visible:</span> <span class="info-value">${visibleIcon} ${tab.pageVisibility.visibilityState}</span></span>`;
  }
  
  // Page Load Time
  if (tab.pageLoadTimes && tab.pageLoadTimes.load) {
    infoHTML += `<span class="info-item"><span class="info-label">Load:</span> <span class="info-value">${tab.pageLoadTimes.load}ms</span></span>`;
  }
  
  tabInfoEl.innerHTML = infoHTML;
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

  // Create resource cards
  const resourcesHtml = currentResources
    .map(resource => createResourceCard(resource))
    .join('');

  tabContentEl.innerHTML = `
    ${navBarHtml}
    <div class="tools-grid">
      ${toolsHtml}
      ${resourcesHtml}
    </div>
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

function createResourceCard(resource) {
  return `
    <div class="tool-widget">
      <h3>${resource.uri}</h3>
      <p>${resource.description || resource.name}</p>
      <button class="btn-primary resource-query" data-resource="${resource.uri}">Query resource</button>
      <div class="resource-result" id="result-${resource.uri.replace(/[^a-zA-Z0-9]/g, '-')}"></div>
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

  // Resource query buttons
  tabContentEl.querySelectorAll('.resource-query').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const resourceUri = e.target.dataset.resource;
      await queryResource(resourceUri, e.target);
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

async function queryResource(resourceUri, button) {
  const resultId = `result-${resourceUri.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const resultDiv = document.getElementById(resultId);
  
  try {
    button.disabled = true;
    button.textContent = 'Querying...';
    resultDiv.innerHTML = '<p style="color: #666;">Loading...</p>';
    
    const response = await window.electronAPI.sendMCPRequest('resources/read', {
      uri: resourceUri
    });
    
    // Display the result
    if (response.contents && response.contents[0]) {
      const data = JSON.parse(response.contents[0].text);
      resultDiv.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    } else {
      resultDiv.innerHTML = '<p class="error">No data returned</p>';
    }
    
    log(`Successfully queried resource: ${resourceUri}`, 'info');
  } catch (error) {
    log(`Failed to query resource ${resourceUri}: ${error.message}`, 'error');
    resultDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Query resource';
  }
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
      updateTabInfo();
    }

    // Update UI
    displayTabs();
  } else if (message.method === 'kapturemcp/tabs_changed' && message.params) {
    // Handle tabs list change notification
    const { tabs } = message.params;
    log(`Tabs list changed: ${tabs.length} tabs`, 'info');
    
    // Debug: Log the full tab data
    if (tabs.length > 0) {
      log(`Tab data received: ${JSON.stringify(tabs)}`, 'debug');
    }
    
    // Update current tabs
    currentTabs = tabs;
    
    // Update UI
    displayTabs();
    
    // If no tab selected and we have tabs, select the first one
    if (!selectedTabId && currentTabs.length > 0) {
      selectTab(currentTabs[0].tabId);
    }
    
    // If selected tab is gone, clear selection
    if (selectedTabId && !currentTabs.find(t => t.tabId === selectedTabId)) {
      selectedTabId = null;
      displayTabContent();
      updateTabInfo();
    } else if (selectedTabId) {
      // Update tab info if selected tab still exists
      updateTabInfo();
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

  // Clear tabs and content
  currentTabs = [];
  selectedTabId = null;
  displayTabs();
  displayTabContent();
  updateTabInfo();

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

// Draggable console setup
let isDragging = false;
let startY = 0;
let startHeight = 0;

consoleDividerEl.addEventListener('mousedown', (e) => {
  isDragging = true;
  startY = e.clientY;
  startHeight = consoleContainerEl.offsetHeight;
  consoleDividerEl.classList.add('dragging');
  document.body.style.cursor = 'ns-resize';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  
  const deltaY = startY - e.clientY;
  const newHeight = Math.max(50, Math.min(window.innerHeight - 200, startHeight + deltaY));
  consoleContainerEl.style.height = newHeight + 'px';
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    consoleDividerEl.classList.remove('dragging');
    document.body.style.cursor = '';
  }
});

// Initial state
log('Kapture MCP Test Client ready');

// Auto-connect on startup
connectToServer();
