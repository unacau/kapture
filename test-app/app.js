/**
 * Main Application
 * Initializes and coordinates all components
 */
class KaptureTestApp {
  constructor() {
    this.mcpClient = null;
    this.tabsManager = null;
    this.toolForms = null;
    this.historyManager = null;
    this.eventListeners = {};
    
    this.initializeApp();
  }

  async initializeApp() {
    try {
      // Initialize components
      this.mcpClient = new MCPClient();
      this.tabsManager = new TabsManager(this.mcpClient);
      this.toolForms = new ToolForms(this.mcpClient, this.tabsManager);
      this.historyManager = new HistoryManager(this.mcpClient);

      // Set up UI event handlers
      this.setupUI();
      
      // Set up tab system
      this.setupTabs();
      
      // Set up connection management
      this.setupConnectionManagement();
      
      // Set up raw MCP interface
      this.setupRawMCP();

      // Update initial state
      this.updateStatus('Ready');
      
      console.log('Kapture Test App initialized successfully');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.updateStatus('Initialization failed', true);
    }
  }

  setupUI() {
    // Set up global event delegation
    document.addEventListener('click', (e) => {
      // Handle any global click events
    });

    // Set up window events
    window.addEventListener('beforeunload', () => {
      if (this.mcpClient && this.mcpClient.isConnected()) {
        this.mcpClient.disconnect();
      }
    });

    // Set up resize handler for responsive design
    window.addEventListener('resize', () => {
      this.handleResize();
    });
  }

  setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.dataset.tab;
        this.showTab(tabId);
      });
    });
  }

  showTab(tabId) {
    // Update button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

    // Update content visibility
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabId}-tab`).classList.add('active');

    // Emit tab change event
    this.emit('tab-changed', { tabId });
  }

  setupConnectionManagement() {
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    connectBtn.addEventListener('click', async () => {
      try {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
        statusIndicator.className = 'status-indicator connecting';
        statusText.textContent = 'Connecting...';

        await this.mcpClient.connect();
        
        // Connection successful
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connect to Server';
        disconnectBtn.disabled = false;
        statusIndicator.className = 'status-indicator connected';
        statusText.textContent = 'Connected';
        
        this.updateStatus('Connected to MCP server');
      } catch (error) {
        console.error('Connection failed:', error);
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect to Server';
        disconnectBtn.disabled = true;
        statusIndicator.className = 'status-indicator';
        statusText.textContent = 'Connection failed';
        
        this.updateStatus(`Connection failed: ${error.message}`, true);
      }
    });

    disconnectBtn.addEventListener('click', () => {
      this.mcpClient.disconnect();
      
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      statusIndicator.className = 'status-indicator';
      statusText.textContent = 'Disconnected';
      
      this.updateStatus('Disconnected from MCP server');
    });

    // Listen for connection state changes
    this.mcpClient.on('connection-change', (data) => {
      if (data.connected) {
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        statusIndicator.className = 'status-indicator connected';
        statusText.textContent = 'Connected';
      } else {
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        statusIndicator.className = 'status-indicator';
        statusText.textContent = data.error ? 'Connection error' : 'Disconnected';
      }
    });
  }

  setupRawMCP() {
    const sendRawBtn = document.getElementById('send-raw-btn');
    const clearRawBtn = document.getElementById('clear-raw-btn');
    const rawMethod = document.getElementById('raw-method');
    const rawParams = document.getElementById('raw-params');
    const rawResponseText = document.getElementById('raw-response-text');

    sendRawBtn.addEventListener('click', async () => {
      try {
        if (!this.mcpClient.isConnected()) {
          throw new Error('Not connected to MCP server');
        }

        sendRawBtn.disabled = true;
        sendRawBtn.textContent = 'Sending...';

        const method = rawMethod.value;
        let params = {};
        
        if (rawParams.value.trim()) {
          try {
            params = JSON.parse(rawParams.value);
          } catch (e) {
            throw new Error('Invalid JSON in parameters');
          }
        }

        // Handle different methods
        let result;
        if (method === 'tools/list') {
          result = await this.mcpClient.listTabs();
        } else if (method === 'tools/call') {
          if (!params.name) {
            throw new Error('Tool name is required for tools/call');
          }
          
          const { name, arguments: toolArgs = {} } = params;
          
          // Map tool names to client methods
          switch (name) {
            case 'kaptivemcp_list_tabs':
              result = await this.mcpClient.executeListTabs();
              break;
            case 'kaptivemcp_navigate':
              result = await this.mcpClient.executeNavigate(toolArgs.tabId, toolArgs.url, toolArgs.timeout);
              break;
            case 'kaptivemcp_screenshot':
              result = await this.mcpClient.executeScreenshot(toolArgs.tabId, toolArgs.name, toolArgs.selector, toolArgs.width, toolArgs.height);
              break;
            // Add other tools as needed
            default:
              throw new Error(`Unknown tool: ${name}`);
          }
        } else {
          throw new Error(`Unknown method: ${method}`);
        }

        // Display response
        rawResponseText.textContent = JSON.stringify(result, null, 2);
        rawResponseText.className = 'response-success';

      } catch (error) {
        console.error('Raw MCP request failed:', error);
        rawResponseText.textContent = `Error: ${error.message}`;
        rawResponseText.className = 'response-error';
      } finally {
        sendRawBtn.disabled = false;
        sendRawBtn.textContent = 'Send Request';
      }
    });

    clearRawBtn.addEventListener('click', () => {
      rawParams.value = '';
      rawResponseText.textContent = '';
      rawResponseText.className = '';
    });
  }

  updateStatus(message, isError = false) {
    const statusMessage = document.getElementById('status-message');
    const lastExecutionTime = document.getElementById('last-execution-time');
    
    if (statusMessage) {
      statusMessage.textContent = message;
      statusMessage.style.color = isError ? '#e53e3e' : '';
    }
    
    if (lastExecutionTime) {
      lastExecutionTime.textContent = new Date().toLocaleTimeString();
    }
  }

  handleResize() {
    // Handle responsive design adjustments if needed
    const width = window.innerWidth;
    
    if (width < 768) {
      // Mobile adjustments
      document.body.classList.add('mobile');
    } else {
      document.body.classList.remove('mobile');
    }
  }

  // Event system for component communication
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Event listener error:', error);
        }
      });
    }
  }

  // Utility methods
  showNotification(message, type = 'info') {
    // Create a simple notification system
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      background: ${type === 'error' ? '#fed7d7' : '#e6fffa'};
      color: ${type === 'error' ? '#742a2a' : '#234e52'};
      border: 1px solid ${type === 'error' ? '#feb2b2' : '#b2f5ea'};
      border-radius: 6px;
      z-index: 1000;
      max-width: 300px;
      word-wrap: break-word;
    `;

    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  // Cleanup method
  destroy() {
    if (this.mcpClient && this.mcpClient.isConnected()) {
      this.mcpClient.disconnect();
    }
    
    if (this.tabsManager) {
      this.tabsManager.destroy();
    }
    
    if (this.historyManager) {
      this.historyManager.destroy();
    }
  }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new KaptureTestApp();
});