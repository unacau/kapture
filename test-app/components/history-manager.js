/**
 * History Manager Component
 * Handles command history tracking and display
 */
class HistoryManager {
  constructor(mcpClient) {
    this.mcpClient = mcpClient;
    this.history = [];
    this.maxHistorySize = 1000;
    
    this.initializeElements();
    this.setupEventListeners();
    this.loadHistory();
  }

  initializeElements() {
    this.historyList = document.getElementById('history-list');
    this.clearHistoryBtn = document.getElementById('clear-history-btn');
    this.exportHistoryBtn = document.getElementById('export-history-btn');
  }

  setupEventListeners() {
    // Clear history button
    this.clearHistoryBtn.addEventListener('click', () => {
      this.clearHistory();
    });

    // Export history button
    this.exportHistoryBtn.addEventListener('click', () => {
      this.exportHistory();
    });

    // Listen for command responses
    this.mcpClient.on('command-response', (data) => {
      this.addHistoryEntry(data);
    });
  }

  addHistoryEntry(data) {
    const entry = {
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: data.timestamp || new Date().toISOString(),
      command: data.command,
      params: data.params || {},
      success: data.success,
      response: data.response || null,
      error: data.error || null
    };

    // Add to beginning of history
    this.history.unshift(entry);

    // Trim history if too large
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }

    // Save to localStorage
    this.saveHistory();

    // Update display
    this.renderHistory();
  }

  renderHistory() {
    if (this.history.length === 0) {
      this.historyList.innerHTML = '<p class="help-text">Command history will appear here</p>';
      return;
    }

    const historyHtml = this.history.map(entry => this.renderHistoryEntry(entry)).join('');
    this.historyList.innerHTML = historyHtml;

    // Add click listeners to toggle buttons
    this.historyList.querySelectorAll('.history-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const historyItem = btn.closest('.history-item');
        this.toggleHistoryDetails(historyItem);
        
        // Update toggle button icon
        btn.textContent = btn.textContent === '▶' ? '▼' : '▶';
      });
    });
    
    // Add click listeners to copy buttons
    this.historyList.querySelectorAll('.history-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const historyItem = btn.closest('.history-item');
        this.copyHistoryItem(historyItem);
      });
    });
  }

  renderHistoryEntry(entry) {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const statusClass = entry.success ? 'success' : 'error';
    const statusText = entry.success ? 'Success' : 'Error';

    // Format parameters for display
    const paramsText = Object.keys(entry.params).length > 0 
      ? JSON.stringify(entry.params, null, 2)
      : '{}';

    return `
      <div class="history-item ${statusClass}" data-entry-id="${entry.id}">
        <div class="history-header">
          <div class="history-header-left">
            <button class="history-toggle-btn" aria-label="Toggle details">▶</button>
            <span class="history-tool">${entry.command}</span>
          </div>
          <div class="history-header-right">
            <span class="history-status ${statusClass}">${statusText}</span>
            <span class="history-timestamp">${timestamp}</span>
            <button class="history-copy-btn" aria-label="Copy to clipboard">📋</button>
          </div>
        </div>
        <div class="history-params" style="display: none;">
          <strong>Parameters:</strong>
          <pre class="selectable">${this.escapeHtml(paramsText)}</pre>
          
          ${entry.success ? `
            <strong>Response:</strong>
            <pre class="selectable">${this.escapeHtml(JSON.stringify(entry.response, null, 2))}</pre>
          ` : `
            <strong>Error:</strong>
            <pre class="selectable" style="color: #e53e3e;">${this.escapeHtml(entry.error || 'Unknown error')}</pre>
          `}
        </div>
      </div>
    `;
  }

  toggleHistoryDetails(historyItem) {
    const details = historyItem.querySelector('.history-params');
    if (details) {
      const isVisible = details.style.display !== 'none';
      details.style.display = isVisible ? 'none' : 'block';
    }
  }

  copyHistoryItem(historyItem) {
    const entryId = historyItem.dataset.entryId;
    const entry = this.history.find(e => e.id === entryId);
    
    if (!entry) return;
    
    // Format the entry data for copying
    const copyText = `Command: ${entry.command}
Timestamp: ${new Date(entry.timestamp).toLocaleString()}
Status: ${entry.success ? 'Success' : 'Error'}

Parameters:
${JSON.stringify(entry.params, null, 2)}

${entry.success ? 'Response' : 'Error'}:
${entry.success ? JSON.stringify(entry.response, null, 2) : entry.error || 'Unknown error'}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(copyText).then(() => {
      // Visual feedback
      const copyBtn = historyItem.querySelector('.history-copy-btn');
      const originalText = copyBtn.textContent;
      copyBtn.textContent = '✓';
      copyBtn.style.color = '#34a853';
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.color = '';
      }, 1500);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  clearHistory() {
    if (this.history.length === 0) return;

    if (confirm('Are you sure you want to clear all command history?')) {
      this.history = [];
      this.saveHistory();
      this.renderHistory();
    }
  }

  exportHistory() {
    if (this.history.length === 0) {
      alert('No history to export');
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalEntries: this.history.length,
      history: this.history
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `kapture-history-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  saveHistory() {
    try {
      localStorage.setItem('kapture-command-history', JSON.stringify(this.history));
    } catch (error) {
      console.warn('Failed to save history to localStorage:', error);
    }
  }

  loadHistory() {
    try {
      const savedHistory = localStorage.getItem('kapture-command-history');
      if (savedHistory) {
        this.history = JSON.parse(savedHistory);
        this.renderHistory();
      }
    } catch (error) {
      console.warn('Failed to load history from localStorage:', error);
      this.history = [];
    }
  }

  // Get history statistics
  getStatistics() {
    const stats = {
      totalCommands: this.history.length,
      successfulCommands: this.history.filter(entry => entry.success).length,
      failedCommands: this.history.filter(entry => !entry.success).length,
      commandTypes: {},
      dateRange: null
    };

    // Count command types
    this.history.forEach(entry => {
      const command = entry.command;
      stats.commandTypes[command] = (stats.commandTypes[command] || 0) + 1;
    });

    // Calculate date range
    if (this.history.length > 0) {
      const timestamps = this.history.map(entry => new Date(entry.timestamp).getTime());
      const earliest = new Date(Math.min(...timestamps));
      const latest = new Date(Math.max(...timestamps));
      stats.dateRange = {
        earliest: earliest.toISOString(),
        latest: latest.toISOString()
      };
    }

    return stats;
  }

  // Find history entries by criteria
  findEntries(criteria) {
    return this.history.filter(entry => {
      if (criteria.command && entry.command !== criteria.command) return false;
      if (criteria.success !== undefined && entry.success !== criteria.success) return false;
      if (criteria.since && new Date(entry.timestamp) < new Date(criteria.since)) return false;
      if (criteria.until && new Date(entry.timestamp) > new Date(criteria.until)) return false;
      return true;
    });
  }

  // Replay a command from history
  async replayCommand(entryId) {
    const entry = this.history.find(e => e.id === entryId);
    if (!entry) {
      throw new Error('History entry not found');
    }

    // Note: This would require access to the tool forms to actually replay
    // For now, just return the entry data
    return {
      command: entry.command,
      params: entry.params,
      originalTimestamp: entry.timestamp
    };
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    // Clean up any resources if needed
  }
}

// Export for use in other modules
window.HistoryManager = HistoryManager;