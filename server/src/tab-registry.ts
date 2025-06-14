import { WebSocket } from 'ws';
import { logger } from './logger.js';

export interface TabConnection {
  tabId: string;
  ws: WebSocket;
  url?: string;
  title?: string;
  connectedAt: number;
  lastPing?: number;
}

export class TabRegistry {
  private tabs: Map<string, TabConnection> = new Map();
  private nextTabId: number = 1;
  private disconnectCallback?: (tabId: string) => Promise<void>;

  // Assign a new tab ID or validate requested ID
  assignTabId(requestedId?: string): string {
    // If no ID requested, assign a new one
    if (!requestedId) {
      const newId = this.nextTabId.toString();
      this.nextTabId++;
      return newId;
    }
    
    // If requested ID is already in use by an active connection, assign a new one
    if (this.tabs.has(requestedId)) {
      const existing = this.tabs.get(requestedId)!;
      if (existing.ws.readyState === WebSocket.OPEN) {
        // Tab ID is in use, assign a new one
        const newId = this.nextTabId.toString();
        this.nextTabId++;
        return newId;
      }
    }
    
    // Requested ID is available, use it
    // Update nextTabId if necessary to avoid conflicts
    const requestedNum = parseInt(requestedId);
    if (!isNaN(requestedNum) && requestedNum >= this.nextTabId) {
      this.nextTabId = requestedNum + 1;
    }
    
    return requestedId;
  }

  register(tabId: string, ws: WebSocket): void {
    const connection: TabConnection = {
      tabId,
      ws,
      connectedAt: Date.now(),
    };
    
    this.tabs.set(tabId, connection);
    logger.log(`Tab registered: ${tabId}`);
  }

  unregister(tabId: string): void {
    if (this.tabs.delete(tabId)) {
      logger.log(`Tab unregistered: ${tabId}`);
      // Call the disconnect callback if set
      if (this.disconnectCallback) {
        this.disconnectCallback(tabId).catch(err => {
          logger.error(`Error in disconnect callback for tab ${tabId}:`, err);
        });
      }
    }
  }

  get(tabId: string): TabConnection | undefined {
    return this.tabs.get(tabId);
  }

  getAll(): TabConnection[] {
    return Array.from(this.tabs.values());
  }

  findByWebSocket(ws: WebSocket): TabConnection | undefined {
    for (const connection of this.tabs.values()) {
      if (connection.ws === ws) {
        return connection;
      }
    }
    return undefined;
  }

  updateTabInfo(tabId: string, info: { url?: string; title?: string }): void {
    const connection = this.tabs.get(tabId);
    if (connection) {
      if (info.url !== undefined) connection.url = info.url;
      if (info.title !== undefined) connection.title = info.title;
    }
  }

  updateLastPing(tabId: string): void {
    const connection = this.tabs.get(tabId);
    if (connection) {
      connection.lastPing = Date.now();
    }
  }

  getActiveTabCount(): number {
    return this.tabs.size;
  }

  setDisconnectCallback(callback: (tabId: string) => Promise<void>): void {
    this.disconnectCallback = callback;
  }
}