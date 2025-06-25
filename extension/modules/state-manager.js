export class StateManager {
  constructor() {
    this.states = new Map();
    this.listeners = [];
  }

  getState(tabId) {
    return this.states.get(tabId) || { connected: false, status: 'disconnected' };
  }

  setState(tabId, state) {
    this.states.set(tabId, state);
    this.notifyListeners(tabId, state);
  }

  updateState(tabId, updates) {
    const currentState = this.getState(tabId);
    const newState = { ...currentState, ...updates };
    this.setState(tabId, newState);
  }

  addListener(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  notifyListeners(tabId, state) {
    this.listeners.forEach(listener => {
      try {
        listener(tabId, state);
      } catch (error) {
        console.error('State listener error:', error);
      }
    });
  }

  removeTab(tabId) {
    this.states.delete(tabId);
  }
}