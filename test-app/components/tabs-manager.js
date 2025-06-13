/**
 * Tabs Manager Component
 * Handles tab listing, selection, and display
 */
class TabsManager {
  constructor(mcpClient) {
    this.mcpClient = mcpClient;
    this.tabs = [];
    this.selectedTabId = null;
    this.refreshInterval = null;
    
    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    this.tabsList = document.getElementById('tabs-list');
    this.refreshBtn = document.getElementById('refresh-tabs-btn');
    this.selectedTabInfo = document.getElementById('selected-tab-info');
  }

  setupEventListeners() {
    // Refresh button
    this.refreshBtn.addEventListener('click', () => this.refreshTabs());
    
    // MCP client events
    this.mcpClient.on('connection-change', (data) => {
      if (data.connected) {
        this.startAutoRefresh();
        this.refreshTabs();
      } else {
        this.stopAutoRefresh();
        this.clearTabs();
      }
    });

    this.mcpClient.on('tabs-updated', (tabs) => {
      this.updateTabsList(tabs);
    });
  }

  startAutoRefresh() {
    if (this.refreshInterval) return;
    
    this.refreshInterval = setInterval(() => {
      if (this.mcpClient.isConnected()) {
        this.refreshTabs();
      }
    }, 5000); // Refresh every 5 seconds
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async refreshTabs() {
    if (!this.mcpClient.isConnected()) {
      return;
    }

    try {
      this.refreshBtn.disabled = true;
      this.refreshBtn.textContent = 'Refreshing...';
      
      const tabs = await this.mcpClient.listTabs();
      this.updateTabsList(tabs);
    } catch (error) {
      console.error('Error refreshing tabs:', error);
      this.showError('Failed to refresh tabs: ' + error.message);
    } finally {
      this.refreshBtn.disabled = false;
      this.refreshBtn.textContent = 'Refresh';
    }
  }

  updateTabsList(tabs) {
    this.tabs = tabs;
    
    if (tabs.length === 0) {
      this.tabsList.innerHTML = '<p class="empty-state">No tabs connected</p>';
      this.clearSelectedTab();
      return;
    }

    // Check if selected tab still exists
    if (this.selectedTabId && !tabs.find(tab => tab.tabId === this.selectedTabId)) {
      this.clearSelectedTab();
    }

    this.renderTabsList();
  }

  renderTabsList() {
    this.tabsList.innerHTML = '';
    
    this.tabs.forEach(tab => {
      const tabElement = this.createTabElement(tab);
      this.tabsList.appendChild(tabElement);
    });
  }

  createTabElement(tab) {
    const tabElement = document.createElement('div');
    tabElement.className = 'tab-item';
    tabElement.dataset.tabId = tab.tabId;
    
    if (tab.tabId === this.selectedTabId) {
      tabElement.classList.add('selected');
    }

    tabElement.innerHTML = `
      <div class="tab-item-title">${this.escapeHtml(tab.title || 'Untitled')}</div>
      <div class="tab-item-url">${this.escapeHtml(tab.url || 'No URL')}</div>
      <div class="tab-item-id">ID: ${this.escapeHtml(tab.tabId)}</div>
    `;

    tabElement.addEventListener('click', () => {
      this.selectTab(tab.tabId);
    });

    return tabElement;
  }

  selectTab(tabId) {
    // Update selection state
    this.selectedTabId = tabId;
    
    // Update visual selection
    document.querySelectorAll('.tab-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    const selectedElement = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (selectedElement) {
      selectedElement.classList.add('selected');
    }

    // Update selected tab info
    this.updateSelectedTabInfo();
    
    // Emit selection event
    this.emit('tab-selected', { tabId, tab: this.getSelectedTab() });
  }

  clearSelectedTab() {
    this.selectedTabId = null;
    document.querySelectorAll('.tab-item').forEach(item => {
      item.classList.remove('selected');
    });
    this.clearSelectedTabInfo();
    this.emit('tab-selected', { tabId: null, tab: null });
  }

  updateSelectedTabInfo() {
    const selectedTab = this.getSelectedTab();
    if (!selectedTab) {
      this.clearSelectedTabInfo();
      return;
    }

    this.selectedTabInfo.innerHTML = `
      <div class="tab-info-row">
        <span class="tab-info-label">ID:</span>
        <span class="tab-info-value">${this.escapeHtml(selectedTab.tabId)}</span>
      </div>
      <div class="tab-info-row">
        <span class="tab-info-label">Title:</span>
        <span class="tab-info-value">${this.escapeHtml(selectedTab.title || 'Untitled')}</span>
      </div>
      <div class="tab-info-row">
        <span class="tab-info-label">URL:</span>
        <span class="tab-info-value">${this.escapeHtml(selectedTab.url || 'No URL')}</span>
      </div>
      <div class="tab-info-row">
        <span class="tab-info-label">Connected:</span>
        <span class="tab-info-value">${new Date(selectedTab.connectedAt).toLocaleString()}</span>
      </div>
    `;
  }

  clearSelectedTabInfo() {
    this.selectedTabInfo.innerHTML = '<p class="empty-state">No tab selected</p>';
  }

  clearTabs() {
    this.tabs = [];
    this.selectedTabId = null;
    this.tabsList.innerHTML = '<p class="empty-state">No tabs connected</p>';
    this.clearSelectedTabInfo();
  }

  showError(message) {
    this.tabsList.innerHTML = `<p class="empty-state" style="color: #e53e3e;">${this.escapeHtml(message)}</p>`;
  }

  // Getters
  getSelectedTabId() {
    return this.selectedTabId;
  }

  getSelectedTab() {
    if (!this.selectedTabId) return null;
    return this.tabs.find(tab => tab.tabId === this.selectedTabId) || null;
  }

  getAllTabs() {
    return [...this.tabs];
  }

  // Event system
  emit(event, data) {
    if (this.eventListeners && this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => callback(data));
    }
    
    // Also emit to global event system if available
    if (window.app && window.app.emit) {
      window.app.emit(event, data);
    }
  }

  // Helper methods
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    this.stopAutoRefresh();
  }
}

// Export for use in other modules
window.TabsManager = TabsManager;