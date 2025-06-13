/**
 * MCP Client Component
 * Handles connection to MCP server via HTTP endpoints for testing
 */
class MCPClient {
  constructor() {
    this.connected = false;
    this.baseUrl = 'http://localhost:8080';
    this.eventListeners = {
      'connection-change': [],
      'tabs-updated': [],
      'command-response': []
    };
  }

  // Event management
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
  }

  // Connection management
  async connect() {
    try {
      // Test connection by listing tabs
      const response = await fetch(`${this.baseUrl}/tabs`);
      if (response.ok) {
        this.connected = true;
        this.emit('connection-change', { connected: true });
        return true;
      } else {
        throw new Error('Server not responding');
      }
    } catch (error) {
      this.connected = false;
      this.emit('connection-change', { connected: false, error: error.message });
      throw error;
    }
  }

  disconnect() {
    this.connected = false;
    this.emit('connection-change', { connected: false });
  }

  isConnected() {
    return this.connected;
  }

  // Tab management
  async listTabs() {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const response = await fetch(`${this.baseUrl}/tabs`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      this.emit('tabs-updated', data.tabs);
      return data.tabs;
    } catch (error) {
      console.error('Error listing tabs:', error);
      throw error;
    }
  }

  // Command execution
  async executeCommand(tabId, command, params = {}) {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      const response = await fetch(`${this.baseUrl}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tabId,
          command,
          params
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      this.emit('command-response', {
        command,
        params,
        response: data,
        success: true,
        timestamp: new Date().toISOString()
      });

      // Return the actual command result if available, otherwise the full response
      return data.result !== undefined ? data.result : data;
    } catch (error) {
      this.emit('command-response', {
        command,
        params,
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  // Tool execution methods
  async executeListTabs() {
    return await this.listTabs();
  }

  async executeNavigate(tabId, url, timeout = 30000) {
    return await this.executeCommand(tabId, 'kaptivemcp_navigate', { url, timeout });
  }

  async executeGoBack(tabId) {
    return await this.executeCommand(tabId, 'kaptivemcp_go_back');
  }

  async executeGoForward(tabId) {
    return await this.executeCommand(tabId, 'kaptivemcp_go_forward');
  }

  async executeScreenshot(tabId, name, selector = null, width = null, height = null) {
    const params = { name };
    if (selector) params.selector = selector;
    if (width) params.width = width;
    if (height) params.height = height;
    
    return await this.executeCommand(tabId, 'kaptivemcp_screenshot', params);
  }

  async executeClick(tabId, selector) {
    return await this.executeCommand(tabId, 'kaptivemcp_click', { selector });
  }

  async executeHover(tabId, selector) {
    return await this.executeCommand(tabId, 'kaptivemcp_hover', { selector });
  }

  async executeFill(tabId, selector, value) {
    return await this.executeCommand(tabId, 'kaptivemcp_fill', { selector, value });
  }

  async executeSelect(tabId, selector, value) {
    return await this.executeCommand(tabId, 'kaptivemcp_select', { selector, value });
  }

  async executeEvaluate(tabId, code) {
    return await this.executeCommand(tabId, 'kaptivemcp_evaluate', { code });
  }

  async executeLogs(tabId, max = 100) {
    return await this.executeCommand(tabId, 'kaptivemcp_logs', { max });
  }

  async executeDom(tabId, selector = null) {
    const params = {};
    if (selector) params.selector = selector;
    return await this.executeCommand(tabId, 'kaptivemcp_dom', params);
  }
}

// Export for use in other modules
window.MCPClient = MCPClient;