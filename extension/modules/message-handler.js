export class MessageHandler {
  constructor(wsManager, stateManager) {
    this.wsManager = wsManager;
    this.stateManager = stateManager;
  }

  async handleMessage(request, sender) {
    switch (request.type) {
      case 'connect':
        return this.handleConnect(request.tabId);
      
      case 'disconnect':
        return this.handleDisconnect(request.tabId);
      
      case 'getState':
        return this.handleGetState(request.tabId);
      
      default:
        return { error: `Unknown message type: ${request.type}` };
    }
  }

  handleConnect(tabId) {
    if (this.wsManager.has(tabId)) {
      return { ok: true, message: 'Already connected' };
    }

    this.wsManager.connect(tabId, 'ws://localhost:61822', {
      onOpen: () => {
        this.stateManager.updateState(tabId, { connected: true, status: 'connected' });
      },
      onClose: () => {
        // Don't update state here - let reconnection logic handle it
        // State will be updated by onReconnecting or when user disconnects
      },
      onError: () => {
        // Don't update state here - let reconnection logic handle it
      },
      onReconnecting: (attempt, backoffMs) => {
        this.stateManager.updateState(tabId, { 
          connected: false, 
          status: 'retrying',
          reconnectAttempt: attempt,
          nextRetryIn: backoffMs
        });
      },
      onUserDisconnected: () => {
        this.stateManager.updateState(tabId, { connected: false, status: 'disconnected' });
      }
    });

    // Set initial connecting state
    this.stateManager.updateState(tabId, { connected: false, status: 'retrying' });

    return { ok: true };
  }

  handleDisconnect(tabId) {
    const disconnected = this.wsManager.disconnect(tabId);
    // State update is handled by WebSocket manager callbacks
    return { ok: true, disconnected };
  }

  handleGetState(tabId) {
    return this.stateManager.getState(tabId);
  }
}