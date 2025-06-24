import { BrowserWebSocketManager } from './browser-websocket-manager.js';
import { TabRegistry } from './tab-registry.js';
import { logger } from './logger.js';

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

export class BrowserCommandHandler {
  private pendingCommands: Map<string, {
    resolve: (result: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
    tabId?: string;
  }> = new Map();
  private clientInfo: { name?: string; version?: string } = {};

  constructor(
    private browserWebSocketManager: BrowserWebSocketManager,
    private tabRegistry: TabRegistry
  ) {}

  setClientInfo(info: { name?: string; version?: string }) {
    this.clientInfo = info;
  }

  // ========================================================================
  // Public Convenience Methods for All Commands
  // ========================================================================

  /**
   * Navigate to a URL
   */
  async navigate(tabId: string, url: string, timeout?: number): Promise<any> {
    return this.executeCommand('navigate', { tabId, url, timeout });
  }

  /**
   * Navigate back in browser history
   */
  async goBack(tabId: string): Promise<any> {
    return this.executeCommand('back', { tabId });
  }

  /**
   * Navigate forward in browser history
   */
  async goForward(tabId: string): Promise<any> {
    return this.executeCommand('forward', { tabId });
  }

  /**
   * Click on an element
   */
  async click(tabId: string, selector?: string, xpath?: string): Promise<any> {
    return this.executeCommand('click', { tabId, selector, xpath });
  }

  /**
   * Hover over an element
   */
  async hover(tabId: string, selector?: string, xpath?: string): Promise<any> {
    return this.executeCommand('hover', { tabId, selector, xpath });
  }

  /**
   * Fill an input field
   */
  async fill(tabId: string, value: string, selector?: string, xpath?: string): Promise<any> {
    return this.executeCommand('fill', { tabId, value, selector, xpath });
  }

  /**
   * Select an option from a dropdown
   */
  async select(tabId: string, value: string, selector?: string, xpath?: string): Promise<any> {
    return this.executeCommand('select', { tabId, value, selector, xpath });
  }

  /**
   * Send a keypress event
   */
  async keypress(tabId: string, key: string, params?: {
    selector?: string;
    xpath?: string;
    delay?: number;
    timeout?: number;
  }): Promise<any> {
    return this.executeCommand('keypress', { tabId, key, ...params });
  }

  /**
   * Take a screenshot
   */
  async screenshot(tabId: string, params?: {
    selector?: string;
    xpath?: string;
    scale?: number;
    format?: 'webp' | 'jpeg' | 'png';
    quality?: number;
  }): Promise<any> {
    return this.executeCommand('screenshot', { tabId, ...params });
  }

  /**
   * Execute JavaScript code
   */
  async evaluate(tabId: string, code: string): Promise<any> {
    return this.executeCommand('evaluate', { tabId, code });
  }

  /**
   * Get DOM HTML
   */
  async getDom(tabId: string, selector?: string, xpath?: string): Promise<any> {
    return this.executeCommand('dom', { tabId, selector, xpath });
  }

  /**
   * Get elements matching a selector
   */
  async getElements(tabId: string, params: {
    selector?: string;
    xpath?: string;
    visible?: string;
  }): Promise<any> {
    return this.executeCommand('elements', { tabId, ...params });
  }

  /**
   * Get elements at specific coordinates
   */
  async getElementsFromPoint(tabId: string, x: number, y: number): Promise<any> {
    return this.executeCommand('elementsFromPoint', { tabId, x, y });
  }

  /**
   * Get console logs from the browser
   */
  async getConsoleLogs(tabId: string, before?: string, limit: number = 100, level?: string): Promise<any> {
    return this.executeCommand('getLogs', { tabId, before, limit, level });
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private async executeCommand(command: string, args: any): Promise<any> {
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
      this.browserWebSocketManager.sendCommand(tabId, commandMessage);

      // Wait for response
      const response = await responsePromise;
      logger.log(`Command completed: ${command} (${commandId})`);
      return response;
    } catch (error: any) {
      throw new Error(error.message);
    }
  }

  /**
   * Handle command response from browser extension
   * Called by BrowserWebSocketManager when a response is received
   */
  handleCommandResponse(response: CommandResponse): void {
    logger.log(`Browser Command Handler received command response: ${response.id}, success: ${response.success}`);
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

  cleanup(): void {
    // Clear all pending commands
    for (const [commandId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Browser command handler shutting down'));
    }
    this.pendingCommands.clear();
  }
}
