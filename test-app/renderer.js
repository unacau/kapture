// Renderer process for Kapture MCP Test Client
let connected = false;
let currentTools = [];
let currentTabs = [];
let selectedTabId = null;

// DOM elements
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const connectBtn = document.getElementById('connect-btn');
const refreshTabsBtn = document.getElementById('refresh-tabs');
const tabListEl = document.getElementById('tab-list');
const urlTextEl = document.getElementById('url-text');
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
connectBtn.addEventListener('click', async () => {
  if (connected) {
    await stopServer();
  } else {
    await startServer();
  }
});

async function startServer() {
  try {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Starting...';
    log('Starting MCP server...');

    const result = await window.electronAPI.connectMCP();
    
    if (result.success) {
      connected = true;
      statusEl.classList.add('connected');
      statusTextEl.textContent = 'Server Running';
      connectBtn.textContent = 'Stop Server';
      refreshTabsBtn.disabled = false;
      
      log('MCP server started successfully', 'info');
      log(`Server capabilities: ${JSON.stringify(result.capabilities)}`, 'info');
      
      // Auto-discover tools
      await discoverTools();
      await refreshTabs();
    } else {
      throw new Error(result.error || 'Failed to start server');
    }
  } catch (error) {
    log(`Failed to start server: ${error.message}`, 'error');
    connected = false;
  } finally {
    connectBtn.disabled = false;
  }
}

async function stopServer() {
  try {
    await window.electronAPI.disconnectMCP();
    connected = false;
    statusEl.classList.remove('connected');
    statusTextEl.textContent = 'Server Stopped';
    connectBtn.textContent = 'Start Server';
    refreshTabsBtn.disabled = true;
    
    // Clear tabs and content
    currentTabs = [];
    selectedTabId = null;
    displayTabs();
    
    log('MCP server stopped');
  } catch (error) {
    log(`Error stopping server: ${error.message}`, 'error');
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

// Tab management
refreshTabsBtn.addEventListener('click', refreshTabs);

async function refreshTabs() {
  try {
    log('Refreshing tabs...');
    const result = await callTool('kaptivemcp_list_tabs', {});
    const content = JSON.parse(result.content[0].text);
    currentTabs = content.tabs || [];
    
    log(`Found ${currentTabs.length} connected tabs`);
    displayTabs();
    
    // If selected tab is gone, clear selection
    if (selectedTabId && !currentTabs.find(t => t.tabId === selectedTabId)) {
      selectedTabId = null;
      displayTabContent();
    }
  } catch (error) {
    log(`Failed to refresh tabs: ${error.message}`, 'error');
    currentTabs = [];
    displayTabs();
  }
}

function displayTabs() {
  tabListEl.innerHTML = '';
  
  if (currentTabs.length === 0) {
    tabListEl.innerHTML = '<div class="empty-state" style="padding: 0.5rem;">No tabs connected</div>';
    urlTextEl.textContent = 'No tab selected';
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
  const tab = currentTabs.find(t => t.tabId === tabId);
  
  if (tab) {
    urlTextEl.textContent = tab.url;
  }
  
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

  // Create tool cards
  const toolsHtml = currentTools
    .filter(tool => tool.name !== 'kaptivemcp_list_tabs') // Skip list tabs tool
    .map(tool => createToolCard(tool))
    .join('');

  tabContentEl.innerHTML = `<div class="tools-grid">${toolsHtml}</div>`;

  // Restore form data if exists
  if (tabFormData[selectedTabId]) {
    Object.entries(tabFormData[selectedTabId]).forEach(([toolName, params]) => {
      Object.entries(params).forEach(([paramName, value]) => {
        const input = document.getElementById(`${toolName}-${paramName}`);
        if (input) input.value = value;
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
        inputHtml = `<input type="number" id="${inputId}" ${isRequired ? 'required' : ''}>`;
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
      <div id="result-${tool.name}" class="tool-result" style="display: none;"></div>
    </div>
  `;
}

function addToolEventListeners() {
  // Save form data on input
  tabContentEl.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('input', () => {
      const [toolName, paramName] = input.id.split('-');
      if (!tabFormData[selectedTabId]) {
        tabFormData[selectedTabId] = {};
      }
      if (!tabFormData[selectedTabId][toolName]) {
        tabFormData[selectedTabId][toolName] = {};
      }
      tabFormData[selectedTabId][toolName][paramName] = input.value;
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
  
  try {
    button.disabled = true;
    button.textContent = 'Executing...';
    resultEl.style.display = 'block';
    resultEl.className = 'tool-result';
    resultEl.textContent = 'Executing...';

    // Gather parameters
    const params = { tabId: selectedTabId };
    
    const paramProps = tool.inputSchema?.properties || {};
    Object.keys(paramProps).forEach(name => {
      if (name === 'tabId') return;
      
      const input = document.getElementById(`${toolName}-${name}`);
      if (input && input.value) {
        if (paramProps[name].type === 'number') {
          params[name] = parseInt(input.value, 10);
        } else {
          params[name] = input.value;
        }
      }
    });

    log(`Executing ${toolName} with params: ${JSON.stringify(params)}`);
    
    const result = await callTool(toolName, params);
    
    resultEl.className = 'tool-result success';
    
    // Parse and display result
    if (result.content && result.content[0]) {
      const content = JSON.parse(result.content[0].text);
      resultEl.textContent = JSON.stringify(content, null, 2);
      
      // Special handling for screenshots
      if (content.dataUrl) {
        const img = document.createElement('div');
        img.className = 'screenshot-preview';
        img.innerHTML = `<img src="${content.dataUrl}" alt="Screenshot">`;
        resultEl.appendChild(img);
      }
    } else {
      resultEl.textContent = JSON.stringify(result, null, 2);
    }
    
    log(`${toolName} executed successfully`);
  } catch (error) {
    resultEl.className = 'tool-result error';
    resultEl.textContent = `Error: ${error.message}`;
    log(`${toolName} failed: ${error.message}`, 'error');
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

// Clear console
document.getElementById('clear-console').addEventListener('click', () => {
  consoleEl.innerHTML = '';
});

// Listen for MCP notifications
window.electronAPI.onMCPNotification((message) => {
  if (message.method === 'log' && message.params) {
    log(message.params.message, message.params.type || 'info');
  } else {
    log(`Notification: ${message.method}`, 'info');
  }
});

window.electronAPI.onMCPDisconnected((data) => {
  log(`MCP server exited (code: ${data.code})`, 'error');
  stopServer();
});

window.electronAPI.onMCPError((data) => {
  if (data.type === 'PORT_IN_USE') {
    log(data.message, 'error');
    alert('Port 61822 is already in use!\n\nPlease stop any running Kapture server instances:\n- Check for other terminal windows running "npm start"\n- Check for other Electron test app instances\n- Use "lsof -i :61822" to find the process');
    stopServer();
  } else {
    log(`Server error: ${data.message}`, 'error');
  }
});

// Initial state
log('Kapture MCP Test Client ready');