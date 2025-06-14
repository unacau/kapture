import { WebSocketManager } from './websocket-manager.js';
import { TabRegistry } from './tab-registry.js';

interface CommandRequest {
  id: string;
  tabId: string;
  command: string;
  params: any;
}

interface CommandResponse {
  id: string;
  success: boolean;
  result?: any;
  error?: {
    message: string;
    code: string;
  };
}

import { logger } from './logger.js';

export class MCPHandler {
  private pendingCommands: Map<string, {
    resolve: (result: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
    tabId?: string;
  }> = new Map();
  private clientInfo: { name?: string; version?: string } = {};

  constructor(
    private wsManager: WebSocketManager,
    private tabRegistry: TabRegistry
  ) {}

  setClientInfo(info: { name?: string; version?: string }) {
    this.clientInfo = info;
  }

  getClientInfo(): { name?: string; version?: string } {
    return this.clientInfo;
  }

  async executeCommand(command: string, args: any): Promise<any> {
    // Handle list_tabs specially - it doesn't need a tabId
    if (command === 'kapturemcp_list_tabs') {
      return this.listTabs();
    }

    // Extract tabId from args
    const { tabId, ...params } = args;

    if (!tabId) {
      throw new Error('tabId is required');
    }

    // Check if tab exists
    const tab = this.tabRegistry.get(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }

    // Generate unique command ID
    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create command message
    const commandMessage = {
      id: commandId,
      type: 'command',
      command,
      params
    };

    // Setup promise for response
    const responsePromise = new Promise<any>((resolve, reject) => {
      // Set timeout (default 5 seconds)
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        logger.warn(`Command timeout for ${command} (${commandId})`);
        reject(new Error(`Command timeout: ${command}`));
      }, params.timeout || 5000);

      this.pendingCommands.set(commandId, { resolve, reject, timeout, tabId });
      logger.log(`Registered pending command: ${command} (${commandId})`);
    });

    try {
      // Send command to tab
      logger.log(`Sending command to tab ${tabId}: ${command} (${commandId})`);
      this.wsManager.sendCommand(tabId, commandMessage);

      // Wait for response
      const response = await responsePromise;
      logger.log(`Command completed: ${command} (${commandId})`);
      return response;
    } catch (error: any) {
      throw new Error(`Command failed: ${error.message}`);
    }
  }

  handleCommandResponse(response: CommandResponse): void {
    logger.log(`MCP Handler received command response: ${response.id}, success: ${response.success}`);
    logger.log(`Current pending commands before handling: ${Array.from(this.pendingCommands.keys()).join(', ')}`);

    const pending = this.pendingCommands.get(response.id);
    if (!pending) {
      logger.warn(`No pending command found for response: ${response.id}`);
      logger.warn(`Current pending commands: ${Array.from(this.pendingCommands.keys()).join(', ')}`);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeout);
    this.pendingCommands.delete(response.id);

    // If this is a successful response with URL/title, update tab registry
    if (response.success && response.result && pending.tabId) {
      const result = response.result;
      // Update tab info whenever we get URL and title in the response
      if (result.url && result.title) {
        logger.log(`Updating tab ${pending.tabId} info: ${result.url}`);
        this.tabRegistry.updateTabInfo(pending.tabId, {
          url: result.url,
          title: result.title
        });
      }
    }

    // Resolve or reject based on response
    if (response.success) {
      logger.log(`Resolving command ${response.id} with result`);
      pending.resolve(response.result);
    } else {
      logger.log(`Rejecting command ${response.id} with error: ${response.error?.message}`);
      pending.reject(new Error(response.error?.message || 'Command failed'));
    }
  }

  private listTabs(): any {
    const tabs = this.tabRegistry.getAll().map(tab => ({
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      connectedAt: tab.connectedAt,
      lastPing: tab.lastPing
    }));

    return {
      tabs,
      mcpClient: this.clientInfo
    };
  }

  cleanup(): void {
    // Clear all pending commands
    for (const [commandId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MCP handler shutting down'));
    }
    this.pendingCommands.clear();
  }
}
