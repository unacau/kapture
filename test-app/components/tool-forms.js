/**
 * Tool Forms Component
 * Handles dynamic form generation for MCP tools
 */
class ToolForms {
  constructor(mcpClient, tabsManager) {
    this.mcpClient = mcpClient;
    this.tabsManager = tabsManager;
    this.currentTool = null;
    
    this.initializeElements();
    this.setupEventListeners();
    this.initializeToolDefinitions();
  }

  initializeElements() {
    this.toolSelect = document.getElementById('tool-select');
    this.toolForm = document.getElementById('tool-form');
    this.executeBtn = document.getElementById('execute-tool-btn');
    this.clearFormBtn = document.getElementById('clear-form-btn');
    this.toolResponse = document.getElementById('tool-response');
    this.clearResponseBtn = document.getElementById('clear-response-btn');
    this.copyResponseBtn = document.getElementById('copy-response-btn');
  }

  setupEventListeners() {
    this.toolSelect.addEventListener('change', (e) => {
      this.selectTool(e.target.value);
    });

    this.executeBtn.addEventListener('click', () => {
      this.executeTool();
    });

    this.clearFormBtn.addEventListener('click', () => {
      this.clearForm();
    });

    this.clearResponseBtn.addEventListener('click', () => {
      this.clearResponse();
    });

    this.copyResponseBtn.addEventListener('click', () => {
      this.copyResponse();
    });

    // Listen for command responses
    this.mcpClient.on('command-response', (data) => {
      this.displayResponse(data);
    });

    // Listen for tab selection changes
    if (window.app) {
      window.app.on('tab-selected', (data) => {
        this.updateFormState();
      });
    }
  }

  initializeToolDefinitions() {
    this.tools = {
      'kaptivemcp_list_tabs': {
        name: 'List Tabs',
        description: 'List all connected browser tabs',
        requiresTab: false,
        parameters: []
      },
      'kaptivemcp_navigate': {
        name: 'Navigate',
        description: 'Navigate browser tab to a URL',
        requiresTab: true,
        parameters: [
          { name: 'url', type: 'text', required: true, placeholder: 'https://example.com', description: 'URL to navigate to' },
          { name: 'timeout', type: 'number', required: false, placeholder: '30000', description: 'Navigation timeout in ms (default: 30000)' }
        ]
      },
      'kaptivemcp_go_back': {
        name: 'Go Back',
        description: 'Navigate back in browser history',
        requiresTab: true,
        parameters: []
      },
      'kaptivemcp_go_forward': {
        name: 'Go Forward',
        description: 'Navigate forward in browser history',
        requiresTab: true,
        parameters: []
      },
      'kaptivemcp_screenshot': {
        name: 'Screenshot',
        description: 'Capture a screenshot of the page',
        requiresTab: true,
        parameters: [
          { name: 'selector', type: 'text', required: false, placeholder: '.content', description: 'CSS selector to capture (optional)' }
        ]
      },
      'kaptivemcp_click': {
        name: 'Click Element',
        description: 'Click on a page element',
        requiresTab: true,
        parameters: [
          { name: 'selector', type: 'text', required: true, placeholder: 'button.submit', description: 'CSS selector of element to click' }
        ]
      },
      'kaptivemcp_hover': {
        name: 'Hover Element',
        description: 'Hover over a page element',
        requiresTab: true,
        parameters: [
          { name: 'selector', type: 'text', required: true, placeholder: '.menu-item', description: 'CSS selector of element to hover' }
        ]
      },
      'kaptivemcp_fill': {
        name: 'Fill Input',
        description: 'Fill an input field with text',
        requiresTab: true,
        parameters: [
          { name: 'selector', type: 'text', required: true, placeholder: 'input[name="email"]', description: 'CSS selector of input field' },
          { name: 'value', type: 'text', required: true, placeholder: 'user@example.com', description: 'Text to fill' }
        ]
      },
      'kaptivemcp_select': {
        name: 'Select Option',
        description: 'Select an option from a dropdown',
        requiresTab: true,
        parameters: [
          { name: 'selector', type: 'text', required: true, placeholder: 'select[name="country"]', description: 'CSS selector of select element' },
          { name: 'value', type: 'text', required: true, placeholder: 'US', description: 'Value of option to select' }
        ]
      },
      'kaptivemcp_evaluate': {
        name: 'Execute JavaScript',
        description: 'Execute JavaScript in the browser context',
        requiresTab: true,
        parameters: [
          { name: 'code', type: 'textarea', required: true, placeholder: 'document.title', description: 'JavaScript code to execute' }
        ]
      },
      'kaptivemcp_logs': {
        name: 'Get Console Logs',
        description: 'Retrieve console logs from the browser',
        requiresTab: true,
        parameters: [
          { name: 'max', type: 'number', required: false, placeholder: '100', description: 'Maximum log entries (default: 100)' }
        ]
      }
    };
  }

  selectTool(toolId) {
    this.currentTool = toolId;
    
    if (!toolId) {
      this.clearForm();
      this.executeBtn.disabled = true;
      return;
    }

    const tool = this.tools[toolId];
    if (!tool) {
      this.toolForm.innerHTML = '<p class="help-text" style="color: #e53e3e;">Unknown tool selected</p>';
      this.executeBtn.disabled = true;
      return;
    }

    this.renderToolForm(tool);
    this.updateFormState();
  }

  renderToolForm(tool) {
    const formHtml = `
      <h3>${tool.name}</h3>
      <p class="help-text">${tool.description}</p>
      
      ${tool.requiresTab ? `
        <div class="form-group">
          <label>Selected Tab: <span class="required">*</span></label>
          <div id="selected-tab-display" class="tab-info">
            ${this.tabsManager.getSelectedTab() ? 
              `<span class="tab-info-value">${this.escapeHtml(this.tabsManager.getSelectedTab().title || 'Untitled')}</span>` :
              '<span class="empty-state">No tab selected</span>'
            }
          </div>
        </div>
      ` : ''}
      
      ${tool.parameters.map(param => this.renderParameter(param)).join('')}
    `;

    this.toolForm.innerHTML = formHtml;
  }

  renderParameter(param) {
    const inputId = `param-${param.name}`;
    const isRequired = param.required ? 'required' : '';
    const requiredMark = param.required ? '<span class="required">*</span>' : '';

    let inputHtml;
    if (param.type === 'textarea') {
      inputHtml = `<textarea id="${inputId}" ${isRequired} placeholder="${param.placeholder || ''}" rows="4"></textarea>`;
    } else {
      inputHtml = `<input type="${param.type}" id="${inputId}" ${isRequired} placeholder="${param.placeholder || ''}">`;
    }

    return `
      <div class="form-group">
        <label for="${inputId}">${param.name}: ${requiredMark}</label>
        ${inputHtml}
        ${param.description ? `<small class="help-text">${param.description}</small>` : ''}
      </div>
    `;
  }

  updateFormState() {
    if (!this.currentTool) {
      this.executeBtn.disabled = true;
      return;
    }

    const tool = this.tools[this.currentTool];
    if (!tool) {
      this.executeBtn.disabled = true;
      return;
    }

    // Check if tab is required and selected
    if (tool.requiresTab && !this.tabsManager.getSelectedTabId()) {
      this.executeBtn.disabled = true;
      return;
    }

    // Check if connected to MCP server
    if (!this.mcpClient.isConnected()) {
      this.executeBtn.disabled = true;
      return;
    }

    this.executeBtn.disabled = false;

    // Update selected tab display if it exists
    const selectedTabDisplay = document.getElementById('selected-tab-display');
    if (selectedTabDisplay) {
      const selectedTab = this.tabsManager.getSelectedTab();
      if (selectedTab) {
        selectedTabDisplay.innerHTML = `<span class="tab-info-value">${this.escapeHtml(selectedTab.title || 'Untitled')}</span>`;
        selectedTabDisplay.className = 'tab-info';
      } else {
        selectedTabDisplay.innerHTML = '<span class="empty-state">No tab selected</span>';
        selectedTabDisplay.className = 'tab-info';
      }
    }
  }

  async executeTool() {
    if (!this.currentTool) return;

    const tool = this.tools[this.currentTool];
    if (!tool) return;

    try {
      this.executeBtn.disabled = true;
      this.executeBtn.textContent = 'Executing...';

      // Get form parameters
      const params = {};
      tool.parameters.forEach(param => {
        const input = document.getElementById(`param-${param.name}`);
        if (input && input.value) {
          let value = input.value;
          // Convert numbers
          if (param.type === 'number') {
            value = parseInt(value, 10);
          }
          params[param.name] = value;
        }
      });

      // Get tab ID if required
      const tabId = tool.requiresTab ? this.tabsManager.getSelectedTabId() : null;

      // Execute the appropriate method
      let result;
      switch (this.currentTool) {
        case 'kaptivemcp_list_tabs':
          result = await this.mcpClient.executeListTabs();
          break;
        case 'kaptivemcp_navigate':
          result = await this.mcpClient.executeNavigate(tabId, params.url, params.timeout);
          break;
        case 'kaptivemcp_go_back':
          result = await this.mcpClient.executeGoBack(tabId);
          break;
        case 'kaptivemcp_go_forward':
          result = await this.mcpClient.executeGoForward(tabId);
          break;
        case 'kaptivemcp_screenshot':
          result = await this.mcpClient.executeScreenshot(tabId, params.name, params.selector, params.width, params.height);
          break;
        case 'kaptivemcp_click':
          result = await this.mcpClient.executeClick(tabId, params.selector);
          break;
        case 'kaptivemcp_hover':
          result = await this.mcpClient.executeHover(tabId, params.selector);
          break;
        case 'kaptivemcp_fill':
          result = await this.mcpClient.executeFill(tabId, params.selector, params.value);
          break;
        case 'kaptivemcp_select':
          result = await this.mcpClient.executeSelect(tabId, params.selector, params.value);
          break;
        case 'kaptivemcp_evaluate':
          result = await this.mcpClient.executeEvaluate(tabId, params.code);
          break;
        case 'kaptivemcp_logs':
          result = await this.mcpClient.executeLogs(tabId, params.max);
          break;
        default:
          throw new Error('Unknown tool: ' + this.currentTool);
      }

      console.log('Tool execution result:', result);

    } catch (error) {
      console.error('Tool execution error:', error);
    } finally {
      this.executeBtn.disabled = false;
      this.executeBtn.textContent = 'Execute Tool';
      this.updateFormState();
    }
  }

  displayResponse(data) {
    const timestamp = new Date().toLocaleString();
    const statusClass = data.success ? 'response-success' : 'response-error';
    
    let responseText;
    if (data.success) {
      responseText = JSON.stringify(data.response, null, 2);
    } else {
      responseText = `Error: ${data.error}`;
    }

    const responseHtml = `
      <div class="response-timestamp">${timestamp}</div>
      <div class="${statusClass}">
        <strong>Command:</strong> ${data.command}<br>
        <strong>Status:</strong> ${data.success ? 'Success' : 'Error'}<br><br>
        <pre>${this.escapeHtml(responseText)}</pre>
      </div>
    `;

    this.toolResponse.innerHTML = responseHtml;

    // Show screenshot if response contains image data
    if (data.success && data.response && data.response.imageData) {
      this.displayScreenshot(data.response.imageData);
    }
  }

  displayScreenshot(imageData) {
    const screenshotHtml = `
      <div class="screenshot-preview">
        <h4>Screenshot Preview</h4>
        <img src="data:image/png;base64,${imageData}" alt="Screenshot" />
      </div>
    `;
    this.toolResponse.innerHTML += screenshotHtml;
  }

  clearForm() {
    this.toolForm.innerHTML = '<p class="help-text">Select a tool to see its parameters</p>';
    this.currentTool = null;
    this.executeBtn.disabled = true;
  }

  clearResponse() {
    this.toolResponse.innerHTML = '<p class="help-text">Tool responses will appear here</p>';
  }

  copyResponse() {
    const responseText = this.toolResponse.textContent || this.toolResponse.innerText;
    if (responseText) {
      navigator.clipboard.writeText(responseText).then(() => {
        // Show brief feedback
        const originalText = this.copyResponseBtn.textContent;
        this.copyResponseBtn.textContent = 'Copied!';
        setTimeout(() => {
          this.copyResponseBtn.textContent = originalText;
        }, 1000);
      }).catch(err => {
        console.error('Failed to copy response:', err);
      });
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export for use in other modules
window.ToolForms = ToolForms;