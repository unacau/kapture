// Connection state enum
export const ConnectionStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RETRYING: 'retrying',
  ERROR: 'error'
};

// Message class
export class Message {
  constructor(direction, data) {
    this.id = crypto.randomUUID();
    this.direction = direction; // 'incoming' | 'outgoing'
    this.data = data;
    this.timestamp = new Date();
  }
}

// Console log entry class
export class ConsoleLogEntry {
  constructor(level, args, stackTrace) {
    this.id = crypto.randomUUID();
    this.level = level; // 'log' | 'info' | 'warn' | 'error'
    this.args = args;
    this.stackTrace = stackTrace;
    this.timestamp = new Date();
  }
}

// WebSocket connection info
export class ConnectionInfo {
  constructor(url) {
    this.url = url;
    this.status = ConnectionStatus.DISCONNECTED;
    this.connected = false;
    this.userDisconnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.lastConnectedAt = null;
    this.lastDisconnectedAt = null;
    this.nextRetryIn = null;
  }

  setConnected() {
    this.status = ConnectionStatus.CONNECTED;
    this.connected = true;
    this.reconnectAttempts = 0;
    this.nextRetryIn = null;
    this.lastConnectedAt = new Date();
  }

  setDisconnected(userInitiated = false) {
    this.status = ConnectionStatus.DISCONNECTED;
    this.connected = false;
    this.userDisconnected = userInitiated;
    this.lastDisconnectedAt = new Date();
    if (userInitiated) {
      this.reconnectAttempts = 0;
      this.nextRetryIn = null;
    }
  }

  setRetrying(attemptNumber, nextRetryMs) {
    this.status = ConnectionStatus.RETRYING;
    this.connected = false;
    this.reconnectAttempts = attemptNumber;
    this.nextRetryIn = nextRetryMs;
  }

  setError(error) {
    this.status = ConnectionStatus.ERROR;
    this.connected = false;
    this.lastError = error;
    this.lastDisconnectedAt = new Date();
  }
}

// Main tab state class
export class TabState {
  constructor(tabId) {
    this.tabId = tabId;
    this.websocket = null;
    this.connectionInfo = new ConnectionInfo('ws://localhost:61822');
    this.messages = [];
    this.consoleLogs = [];
    this.ports = new Set(); // Connected DevTools panels/popups
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
  }

  // WebSocket management
  setWebSocket(ws) {
    this.websocket = ws;
    this.updateActivity();
  }

  clearWebSocket() {
    this.websocket = null;
    this.updateActivity();
  }

  // Message management
  addMessage(direction, data) {
    const message = new Message(direction, data);
    this.messages.push(message);
    this.updateActivity();
    return message;
  }

  clearMessages() {
    this.messages = [];
    this.updateActivity();
  }

  getMessages(limit = null) {
    if (limit === null) {
      return [...this.messages];
    }
    return this.messages.slice(-limit);
  }

  // Console log management
  addConsoleLog(level, args, stackTrace) {
    const log = new ConsoleLogEntry(level, args, stackTrace);
    this.consoleLogs.push(log);
    this.updateActivity();
    return log;
  }

  clearConsoleLogs() {
    this.consoleLogs = [];
    this.updateActivity();
  }

  getConsoleLogs(limit = null, level = null) {
    let logs = this.consoleLogs;
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    if (limit === null) {
      return [...logs];
    }
    return logs.slice(-limit);
  }

  getConsoleLogCount() {
    return this.consoleLogs.length;
  }

  // Port management
  addPort(port) {
    this.ports.add(port);
    this.updateActivity();
  }

  removePort(port) {
    this.ports.delete(port);
    this.updateActivity();
  }

  broadcastToPorts(message) {
    this.ports.forEach(port => {
      try {
        port.postMessage(message);
      } catch (e) {
        // Port might be disconnected
        this.ports.delete(port);
      }
    });
  }

  // State management
  getConnectionState() {
    return {
      connected: this.connectionInfo.connected,
      status: this.connectionInfo.status,
      reconnectAttempt: this.connectionInfo.reconnectAttempts,
      nextRetryIn: this.connectionInfo.nextRetryIn
    };
  }

  updateActivity() {
    this.lastActivityAt = new Date();
  }

  // Cleanup
  cleanup() {
    // Clear reconnect timer
    if (this.connectionInfo.reconnectTimer) {
      clearTimeout(this.connectionInfo.reconnectTimer);
      this.connectionInfo.reconnectTimer = null;
    }

    // Close WebSocket
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    // Clear all data
    this.messages = [];
    this.consoleLogs = [];
    this.ports.clear();
  }

  // Serialization for debugging
  toJSON() {
    return {
      tabId: this.tabId,
      connectionInfo: {
        url: this.connectionInfo.url,
        status: this.connectionInfo.status,
        connected: this.connectionInfo.connected,
        reconnectAttempts: this.connectionInfo.reconnectAttempts
      },
      messageCount: this.messages.length,
      consoleLogCount: this.consoleLogs.length,
      portCount: this.ports.size,
      createdAt: this.createdAt,
      lastActivityAt: this.lastActivityAt
    };
  }
}