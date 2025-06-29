import { WebSocket } from 'ws';
import { logger } from './logger.js';

export interface TabConnection {
  tabId: string;
  ws: WebSocket;
  url?: string;
  title?: string;
  connectedAt: number;
  lastPing?: number;
  domSize?: number;
  fullPageDimensions?: { width: number; height: number };
  viewportDimensions?: { width: number; height: number };
  scrollPosition?: { x: number; y: number };
  pageVisibility?: { visible: boolean; visibilityState: string };
}

export class TabRegistry {
  private tabs: Map<string, TabConnection> = new Map();
  private disconnectCallback?: (tabId: string) => Promise<void>;
  private connectCallback?: (tabId: string) => Promise<void>;
  private updateCallback?: (tabId: string) => Promise<void>;

  register(tabId: string, ws: WebSocket): void {
    const connection: TabConnection = {
      tabId,
      ws,
      connectedAt: Date.now(),
    };

    this.tabs.set(tabId, connection);
    logger.log(`Tab registered: ${tabId}`);

    // Call the connect callback if set
    if (this.connectCallback) {
      this.connectCallback(tabId).catch(err => {
        logger.error(`Error in connect callback for tab ${tabId}:`, err);
      });
    }
  }

  registerWithoutCallback(tabId: string, ws: WebSocket): void {
    const connection: TabConnection = {
      tabId,
      ws,
      connectedAt: Date.now(),
    };

    this.tabs.set(tabId, connection);
    logger.log(`Tab registered: ${tabId}`);
  }

  triggerConnectCallback(tabId: string): void {
    if (this.connectCallback) {
      this.connectCallback(tabId).catch(err => {
        logger.error(`Error in connect callback for tab ${tabId}:`, err);
      });
    }
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

  updateTabInfo(tabId: string, info: {
    url?: string;
    title?: string;
    domSize?: number;
    fullPageDimensions?: { width: number; height: number };
    viewportDimensions?: { width: number; height: number };
    scrollPosition?: { x: number; y: number };
    pageVisibility?: { visible: boolean; visibilityState: string };
  }): void {
    const connection = this.tabs.get(tabId);
    if (connection) {
      const hadChange = (info.url !== undefined && connection.url !== info.url) ||
                       (info.title !== undefined && connection.title !== info.title) ||
                       (info.domSize !== undefined && connection.domSize !== info.domSize) ||
                       (info.fullPageDimensions !== undefined) ||
                       (info.viewportDimensions !== undefined) ||
                       (info.scrollPosition !== undefined) ||
                       (info.pageVisibility !== undefined);

      if (info.url !== undefined) connection.url = info.url;
      if (info.title !== undefined) connection.title = info.title;
      if (info.domSize !== undefined) connection.domSize = info.domSize;
      if (info.fullPageDimensions !== undefined) connection.fullPageDimensions = info.fullPageDimensions;
      if (info.viewportDimensions !== undefined) connection.viewportDimensions = info.viewportDimensions;
      if (info.scrollPosition !== undefined) connection.scrollPosition = info.scrollPosition;
      if (info.pageVisibility !== undefined) connection.pageVisibility = info.pageVisibility;

      // Call the update callback if there was a change
      if (hadChange && this.updateCallback) {
        this.updateCallback(tabId).catch(err => {
          logger.error(`Error in update callback for tab ${tabId}:`, err);
        });
      }
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

  setConnectCallback(callback: (tabId: string) => Promise<void>): void {
    this.connectCallback = callback;
  }

  setUpdateCallback(callback: (tabId: string) => Promise<void>): void {
    this.updateCallback = callback;
  }
}
