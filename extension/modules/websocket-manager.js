export class WebSocketManager {
  constructor() {
    this.connections = new Map();
    this.connectionInfo = new Map(); // Stores connection metadata
  }

  connect(tabId, url, callbacks) {
    if (this.connections.has(tabId)) {
      return this.connections.get(tabId);
    }

    // Initialize connection info
    this.connectionInfo.set(tabId, {
      url,
      callbacks,
      userDisconnected: false,
      reconnectAttempts: 0,
      reconnectTimer: null
    });

    return this._createConnection(tabId);
  }

  _createConnection(tabId) {
    const info = this.connectionInfo.get(tabId);
    if (!info) return null;

    const ws = new WebSocket(info.url);
    this.connections.set(tabId, ws);

    ws.onopen = () => {
      info.reconnectAttempts = 0; // Reset on successful connection
      info.callbacks.onOpen?.();
      ws.send(JSON.stringify({ type: 'register' }));
    };

    ws.onclose = () => {
      this.connections.delete(tabId);
      
      // Only attempt reconnect if not user-initiated disconnect
      if (!info.userDisconnected) {
        // Immediately call onReconnecting before scheduling
        info.callbacks.onReconnecting?.(info.reconnectAttempts + 1, this._getBackoffMs(info.reconnectAttempts));
        this._scheduleReconnect(tabId);
      } else {
        // Clean up if user disconnected
        info.callbacks.onUserDisconnected?.();
        this._cleanup(tabId);
      }
      
      info.callbacks.onClose?.();
    };

    ws.onerror = (error) => {
      this.connections.delete(tabId);
      info.callbacks.onError?.(error);
    };

    ws.onmessage = (event) => {
      info.callbacks.onMessage?.(event);
    };

    return ws;
  }

  _getBackoffMs(attemptNumber) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, then cap at 60s
    return Math.min(1000 * Math.pow(2, attemptNumber), 60000);
  }

  _scheduleReconnect(tabId) {
    const info = this.connectionInfo.get(tabId);
    if (!info || info.userDisconnected) return;

    const backoffMs = this._getBackoffMs(info.reconnectAttempts);
    info.reconnectAttempts++;

    info.reconnectTimer = setTimeout(() => {
      if (!info.userDisconnected) {
        this._createConnection(tabId);
      }
    }, backoffMs);
  }

  disconnect(tabId) {
    const info = this.connectionInfo.get(tabId);
    if (info) {
      info.userDisconnected = true;
      
      // Clear any pending reconnect
      if (info.reconnectTimer) {
        clearTimeout(info.reconnectTimer);
        info.reconnectTimer = null;
      }
    }

    const ws = this.connections.get(tabId);
    if (ws) {
      // Let the onclose handler call onUserDisconnected
      ws.close();
      this.connections.delete(tabId);
    } else {
      // No active connection, we need to call it ourselves
      if (info) {
        info.callbacks.onUserDisconnected?.();
      }
      this._cleanup(tabId);
    }
    
    return true;
  }

  _cleanup(tabId) {
    const info = this.connectionInfo.get(tabId);
    if (info?.reconnectTimer) {
      clearTimeout(info.reconnectTimer);
    }
    this.connectionInfo.delete(tabId);
  }

  get(tabId) {
    return this.connections.get(tabId);
  }

  has(tabId) {
    return this.connections.has(tabId);
  }

  isUserDisconnected(tabId) {
    return this.connectionInfo.get(tabId)?.userDisconnected ?? false;
  }
}