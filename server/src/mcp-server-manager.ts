import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketTransport } from './websocket-transport.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  InitializeRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { WebSocket } from 'ws';
import { logger } from './logger.js';
import { TabRegistry } from './tab-registry.js';
import { WebSocketManager } from './websocket-manager.js';
import { MCPHandler } from './mcp-handler.js';
import { allTools } from './tools/index.js';
import { zodToJsonSchema } from './tools/schema-converter.js';

interface MCPConnection {
  id: string;
  server: Server;
  type: 'stdio' | 'websocket';
  clientInfo?: { name?: string; version?: string };
  initialized: boolean;
}

export class MCPServerManager {
  private connections: Map<string, MCPConnection> = new Map();
  private baseResources: any[];
  private dynamicTabResources: Map<string, any> = new Map();
  private prompts: any[];

  constructor(
    private wsManager: WebSocketManager,
    private tabRegistry: TabRegistry,
    private mcpHandler: MCPHandler,
    private port: number,
    private handleResourceEndpoint: (path: string, queryString?: string) => Promise<{ content: string | Buffer; mimeType: string } | null>
  ) {
    this.baseResources = [
      {
        uri: 'kapture://tabs',
        name: 'Connected Browser Tabs',
        description: 'List of all browser tabs connected to the Kapture server',
        mimeType: 'application/json'
      }
    ];

    this.prompts = [
      {
        name: 'list-tabs',
        description: 'Get a list of all browser tabs connected to Kapture',
        arguments: []
      },
      {
        name: 'tab-details',
        description: 'Get detailed information about a specific browser tab',
        arguments: [
          {
            name: 'tabId',
            description: 'The ID of the tab to get details for',
            required: true
          }
        ]
      },
      {
        name: 'navigate-to-url',
        description: 'Navigate a browser tab to a specific URL',
        arguments: [
          {
            name: 'tabId',
            description: 'The ID of the tab to navigate',
            required: true
          },
          {
            name: 'url',
            description: 'The URL to navigate to',
            required: true
          }
        ]
      },
      {
        name: 'take-screenshot',
        description: 'Capture a screenshot of a browser tab or specific element',
        arguments: [
          {
            name: 'tabId',
            description: 'The ID of the tab to capture',
            required: true
          },
          {
            name: 'selector',
            description: 'CSS selector for a specific element (optional, captures full page if not provided)',
            required: false
          },
          {
            name: 'scale',
            description: 'Scale factor for the screenshot (0.1-1.0, default: 0.3)',
            required: false
          },
          {
            name: 'format',
            description: 'Image format: webp, jpeg, or png (default: webp)',
            required: false
          }
        ]
      }
    ];

    // Set up tab callbacks
    this.setupTabCallbacks();
  }

  private setupTabCallbacks(): void {
    // Tab connect callback
    this.tabRegistry.setConnectCallback(async (tabId: string) => {
      logger.log(`Tab connected: ${tabId}`);
      
      const tab = this.tabRegistry.get(tabId);
      const tabTitle = tab?.title || `Tab ${tabId}`;
      
      this.updateTabResources(tabId, tabTitle);
      
      // Send notifications to all initialized connections
      await this.notifyAllConnections(async (connection) => {
        await connection.server.notification({
          method: 'notifications/resources/list_changed',
          params: {}
        });
      });
      
      await this.sendTabListChangeNotification();
    });

    // Tab update callback
    this.tabRegistry.setUpdateCallback(async (tabId: string) => {
      logger.log(`Tab updated: ${tabId}`);
      
      if (this.dynamicTabResources.has(tabId)) {
        const tab = this.tabRegistry.get(tabId);
        const tabTitle = tab?.title || `Tab ${tabId}`;
        
        this.updateTabResources(tabId, tabTitle);
        
        await this.notifyAllConnections(async (connection) => {
          await connection.server.notification({
            method: 'notifications/resources/list_changed',
            params: {}
          });
        });
      }
      
      await this.sendTabListChangeNotification();
    });

    // Tab disconnect callback
    this.tabRegistry.setDisconnectCallback(async (tabId: string) => {
      // Remove dynamic resources
      this.dynamicTabResources.delete(tabId);
      this.dynamicTabResources.delete(`${tabId}/console`);
      this.dynamicTabResources.delete(`${tabId}/screenshot`);
      this.dynamicTabResources.delete(`${tabId}/elementsFromPoint`);
      this.dynamicTabResources.delete(`${tabId}/dom`);
      this.dynamicTabResources.delete(`${tabId}/querySelectorAll`);
      
      // Send notifications to all initialized connections
      await this.notifyAllConnections(async (connection) => {
        await connection.server.notification({
          method: 'notifications/resources/list_changed',
          params: {}
        });
        
        await connection.server.notification({
          method: 'kapture/tab_disconnected',
          params: {
            tabId,
            timestamp: Date.now()
          }
        });
      });
      
      await this.sendTabListChangeNotification();
    });

    // Set up console log handler
    this.wsManager.setConsoleLogHandler(async (tabId: string, logEntry: any) => {
      await this.notifyAllConnections(async (connection) => {
        await connection.server.notification({
          method: 'kapture/console_log',
          params: {
            tabId,
            logEntry,
            timestamp: Date.now()
          }
        });
      });
    });
  }

  private updateTabResources(tabId: string, tabTitle: string): void {
    this.dynamicTabResources.set(tabId, {
      uri: `kapture://tab/${tabId}`,
      name: `Browser Tab: ${tabTitle}`,
      description: `Information about browser tab ${tabId}`,
      mimeType: 'application/json'
    });
    
    this.dynamicTabResources.set(`${tabId}/console`, {
      uri: `kapture://tab/${tabId}/console`,
      name: `Console Logs: ${tabTitle}`,
      description: `Console log messages from browser tab ${tabId}`,
      mimeType: 'application/json'
    });
    
    this.dynamicTabResources.set(`${tabId}/screenshot`, {
      uri: `kapture://tab/${tabId}/screenshot`,
      name: `Screenshot: ${tabTitle}`,
      description: `Take a screenshot of browser tab ${tabId}`,
      mimeType: 'application/json'
    });
    
    this.dynamicTabResources.set(`${tabId}/elementsFromPoint`, {
      uri: `kapture://tab/${tabId}/elementsFromPoint`,
      name: `Elements at Point: ${tabTitle}`,
      description: `Get information about elements at a coordinate in browser tab ${tabId}`,
      mimeType: 'application/json'
    });
    
    this.dynamicTabResources.set(`${tabId}/dom`, {
      uri: `kapture://tab/${tabId}/dom`,
      name: `DOM: ${tabTitle}`,
      description: `Get the DOM HTML of browser tab ${tabId}`,
      mimeType: 'application/json'
    });
    
    this.dynamicTabResources.set(`${tabId}/querySelectorAll`, {
      uri: `kapture://tab/${tabId}/querySelectorAll`,
      name: `Query Selector All: ${tabTitle}`,
      description: `Query elements by CSS selector in browser tab ${tabId}`,
      mimeType: 'application/json'
    });
  }

  private async notifyAllConnections(handler: (connection: MCPConnection) => Promise<void>): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const connection of this.connections.values()) {
      if (connection.initialized) {
        promises.push(
          handler(connection).catch(error => {
            logger.error(`Failed to notify connection ${connection.id}:`, error);
          })
        );
      }
    }
    
    await Promise.all(promises);
  }

  private async sendTabListChangeNotification(): Promise<void> {
    const tabs = this.tabRegistry.getAll().map(tab => ({
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      connectedAt: tab.connectedAt,
      lastPing: tab.lastPing,
      domSize: tab.domSize,
      fullPageDimensions: tab.fullPageDimensions,
      viewportDimensions: tab.viewportDimensions,
      scrollPosition: tab.scrollPosition,
      pageVisibility: tab.pageVisibility
    }));
    
    logger.log(`Preparing tabs_changed notification with ${tabs.length} tabs`);
    
    await this.notifyAllConnections(async (connection) => {
      await connection.server.notification({
        method: 'kapture/tabs_changed',
        params: {
          tabs,
          timestamp: Date.now()
        }
      });
    });
  }

  private createMCPServer(connectionId: string): Server {
    const server = new Server(
      {
        name: 'kapture-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    // Set up handlers for this server instance
    this.setupServerHandlers(server, connectionId);

    return server;
  }

  private setupServerHandlers(server: Server, connectionId: string): void {
    // Initialize handler
    server.setRequestHandler(InitializeRequestSchema, async (request) => {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      if (request.params.clientInfo) {
        connection.clientInfo = request.params.clientInfo;
        logger.log(`MCP client connected (${connectionId}): ${connection.clientInfo.name} v${connection.clientInfo.version}`);
        
        this.mcpHandler.setClientInfo(connection.clientInfo);
        this.wsManager.setMcpClientInfo(connection.clientInfo);
      }

      return {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        serverInfo: {
          name: 'kapture-mcp-server',
          version: '1.0.0'
        }
      };
    });

    // Handle initialized notification
    server.oninitialized = () => {
      const connection = this.connections.get(connectionId);
      if (connection) {
        logger.log(`Client initialized (${connectionId})`);
        connection.initialized = true;
        
        // Send initial notifications if tabs are connected
        if (this.tabRegistry.getAll().length > 0) {
          this.sendTabListChangeNotification().catch(error => {
            logger.error('Failed to send initial tabs notification:', error);
          });
        }
      }
    };

    // List tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: allTools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: zodToJsonSchema(tool.inputSchema)
        }))
      };
    });

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = allTools.find(t => t.name === name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      try {
        const validatedArgs = tool.inputSchema.parse(args) as any;
        
        // For keypress tool, automatically adjust timeout based on delay
        if (name === 'keypress' && validatedArgs.delay && !validatedArgs.timeout) {
          // Add 2 seconds to the delay for processing overhead
          validatedArgs.timeout = Math.max(5000, validatedArgs.delay + 2000);
        }
        
        const result = await this.mcpHandler.executeCommand(name, validatedArgs);
        
        // Special handling for screenshot tool
        if (name === 'screenshot' && result.dataUrl) {
          const match = result.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const [, mimeType, base64Data] = match;
            
            const params = new URLSearchParams();
            const screenshotArgs = validatedArgs as any;
            if (screenshotArgs?.selector) params.append('selector', String(screenshotArgs.selector));
            if (screenshotArgs?.xpath) params.append('xpath', String(screenshotArgs.xpath));
            if (screenshotArgs?.scale) params.append('scale', String(screenshotArgs.scale));
            if (screenshotArgs?.format) params.append('format', String(screenshotArgs.format));
            if (screenshotArgs?.quality) params.append('quality', String(screenshotArgs.quality));
            
            const queryString = params.toString();
            const screenshotUrl = `http://localhost:${this.port}/tab/${screenshotArgs?.tabId}/screenshot/view${queryString ? '?' + queryString : ''}`;
            
            const enhancedResult = {
              preview: screenshotUrl,
              ...result
            };
            
            return {
              content: [
                {
                  type: 'image',
                  data: base64Data,
                  mimeType: mimeType
                },
                {
                  type: 'text',
                  text: JSON.stringify(enhancedResult, null, 2)
                }
              ]
            };
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error: any) {
        if (error.name === 'ZodError') {
          const issues = error.issues.map((issue: any) => issue.message).join(', ');
          throw new Error(issues);
        }
        return {
          content: [
            {
              type: 'error',
              text: JSON.stringify({error: { message: error.message }}, null, 2)
            }
          ],
          isError: true
        };
      }
    });

    // List resources handler
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const allResources = [
        ...this.baseResources,
        ...Array.from(this.dynamicTabResources.values())
      ];
      
      return {
        resources: allResources
      };
    });

    // Read resource handler
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      // Use the shared resource reading logic
      const result = await this.readResource(uri);
      return result;
    });

    // List prompts handler
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: this.prompts
      };
    });

    // Get prompt handler
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      const prompt = this.prompts.find(p => p.name === name);
      if (!prompt) {
        throw new Error(`Unknown prompt: ${name}`);
      }
      
      // Use the shared prompt logic
      return this.getPrompt(name, args);
    });

    // Handle server close
    server.onclose = () => {
      logger.log(`MCP server connection closed (${connectionId})`);
      this.connections.delete(connectionId);
    };
  }

  async connectStdio(): Promise<void> {
    const connectionId = `stdio-${Date.now()}`;
    const server = this.createMCPServer(connectionId);
    
    this.connections.set(connectionId, {
      id: connectionId,
      server,
      type: 'stdio',
      initialized: false
    });

    const transport = new StdioServerTransport();
    
    // Add disconnect detection for stdin
    process.stdin.on('end', () => {
      logger.log('stdin ended - MCP client disconnected');
      if (transport.onclose) {
        transport.onclose();
      }
    });
    
    process.stdin.on('close', () => {
      logger.log('stdin closed - MCP client disconnected');
      if (transport.onclose) {
        transport.onclose();
      }
    });

    await server.connect(transport);
    logger.log(`MCP stdio server connected (${connectionId})`);
  }

  async connectWebSocket(ws: WebSocket): Promise<void> {
    const connectionId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const server = this.createMCPServer(connectionId);
    
    this.connections.set(connectionId, {
      id: connectionId,
      server,
      type: 'websocket',
      initialized: false
    });

    const transport = new WebSocketTransport(ws);
    
    try {
      await server.connect(transport);
      logger.log(`MCP WebSocket server connected (${connectionId})`);
    } catch (error) {
      logger.error(`Failed to connect MCP WebSocket server (${connectionId}):`, error);
      this.connections.delete(connectionId);
      ws.close();
    }

    // Clean up on close
    ws.on('close', () => {
      logger.log(`MCP WebSocket client disconnected (${connectionId})`);
      this.connections.delete(connectionId);
    });
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnectionInfo(): Array<{ id: string; type: string; clientInfo?: any; initialized: boolean }> {
    return Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      type: conn.type,
      clientInfo: conn.clientInfo,
      initialized: conn.initialized
    }));
  }

  // Shared resource reading logic
  private async readResource(uri: string): Promise<any> {
    if (uri === 'kapture://tabs') {
      const tabsData = this.mcpHandler.listTabs();
      const tabsArray = tabsData.tabs || [];
      
      return {
        contents: [
          {
            uri: 'kapture://tabs',
            mimeType: 'application/json',
            text: JSON.stringify(tabsArray, null, 2)
          }
        ]
      };
    }
    
    // Check various resource patterns
    const patterns = [
      { regex: /^kapture:\/\/tab\/(.+)\/console(?:\?.*)?$/, handler: this.readConsoleResource.bind(this) },
      { regex: /^kapture:\/\/tab\/(.+)\/screenshot(?:\?.*)?$/, handler: this.readScreenshotResource.bind(this) },
      { regex: /^kapture:\/\/tab\/(.+)\/elementsFromPoint(?:\?.*)?$/, handler: this.readElementsResource.bind(this) },
      { regex: /^kapture:\/\/tab\/(.+)\/dom(?:\?.*)?$/, handler: this.readDomResource.bind(this) },
      { regex: /^kapture:\/\/tab\/(.+)\/querySelectorAll(?:\?.*)?$/, handler: this.readQuerySelectorResource.bind(this) },
      { regex: /^kapture:\/\/tab\/(.+)$/, handler: this.readTabResource.bind(this) }
    ];

    for (const { regex, handler } of patterns) {
      const match = uri.match(regex);
      if (match) {
        return handler(uri, match);
      }
    }
    
    throw new Error(`Unknown resource: ${uri}`);
  }

  // Individual resource handlers
  private async readConsoleResource(uri: string, match: RegExpMatchArray): Promise<any> {
    const tabId = match[1];
    
    let before: string | undefined;
    let limit = 100;
    let level: string | undefined;
    const queryMatch = uri.match(/\?(.+)$/);
    if (queryMatch) {
      const params = new URLSearchParams(queryMatch[1]);
      before = params.get('before') || undefined;
      limit = parseInt(params.get('limit') || '100', 10);
      level = params.get('level') || undefined;
      
      if (isNaN(limit) || limit < 1) limit = 100;
      if (limit > 500) limit = 500;
      if (level && !['log', 'info', 'warn', 'error'].includes(level)) {
        level = undefined;
      }
    }
    
    const tab = this.tabRegistry.get(tabId);
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    try {
      const logsData = await this.mcpHandler.getConsoleLogs(tabId, before, limit, level);
      const logs = logsData.logs || [];
      const responseData = {
        logs: logs,
        total: logsData.total || 0,
        limit: limit,
        level: level,
        nextCursor: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
        tabId: tabId,
        url: tab.url,
        title: tab.title
      };
      
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get console logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async readScreenshotResource(uri: string, match: RegExpMatchArray): Promise<any> {
    const tabId = match[1];
    const tab = this.tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    let selector: string | undefined;
    let xpath: string | undefined;
    let scale = 0.3;
    let format: 'webp' | 'jpeg' | 'png' = 'webp';
    let quality = 0.85;
    
    const queryMatch = uri.match(/\?(.+)$/);
    if (queryMatch) {
      const params = new URLSearchParams(queryMatch[1]);
      selector = params.get('selector') || undefined;
      xpath = params.get('xpath') || undefined;
      const scaleParam = params.get('scale');
      if (scaleParam) {
        const parsedScale = parseFloat(scaleParam);
        if (!isNaN(parsedScale) && parsedScale >= 0.1 && parsedScale <= 1) {
          scale = parsedScale;
        }
      }
      const formatParam = params.get('format');
      if (formatParam && ['webp', 'jpeg', 'png'].includes(formatParam)) {
        format = formatParam as 'webp' | 'jpeg' | 'png';
      }
      const qualityParam = params.get('quality');
      if (qualityParam) {
        const parsedQuality = parseFloat(qualityParam);
        if (!isNaN(parsedQuality) && parsedQuality >= 0.1 && parsedQuality <= 1) {
          quality = parsedQuality;
        }
      }
    }
    
    try {
      const screenshotData = await this.mcpHandler.executeCommand('screenshot', {
        tabId,
        selector,
        xpath,
        scale,
        format,
        quality
      });
      
      const viewParams = new URLSearchParams();
      if (selector) viewParams.append('selector', selector);
      viewParams.append('scale', scale.toString());
      viewParams.append('format', format);
      viewParams.append('quality', quality.toString());
      
      const viewQueryString = viewParams.toString();
      const screenshotUrl = `http://localhost:${this.port}/tab/${tabId}/screenshot/view${viewQueryString ? '?' + viewQueryString : ''}`;
      
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              parameters: {
                selector,
                scale,
                format,
                quality
              },
              screenshot: {
                preview: screenshotUrl,
                ...screenshotData
              }
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async readElementsResource(uri: string, match: RegExpMatchArray): Promise<any> {
    const tabId = match[1];
    const tab = this.tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    let x: number | undefined;
    let y: number | undefined;
    
    const queryIndex = uri.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(uri.substring(queryIndex + 1));
      const xParam = params.get('x');
      const yParam = params.get('y');
      
      if (xParam) {
        const parsedX = parseFloat(xParam);
        if (!isNaN(parsedX)) {
          x = parsedX;
        }
      }
      
      if (yParam) {
        const parsedY = parseFloat(yParam);
        if (!isNaN(parsedY)) {
          y = parsedY;
        }
      }
    }
    
    if (x === undefined || y === undefined) {
      throw new Error('Both x and y coordinates are required');
    }
    
    try {
      const elementsData = await this.mcpHandler.executeCommand('elementsFromPoint', {
        tabId,
        x,
        y
      });
      
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              coordinates: { x, y },
              elements: elementsData
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get elements from point: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async readDomResource(uri: string, match: RegExpMatchArray): Promise<any> {
    const tabId = match[1];
    const tab = this.tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    let selector: string | undefined;
    let xpath: string | undefined;
    
    const queryIndex = uri.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(uri.substring(queryIndex + 1));
      selector = params.get('selector') || undefined;
      xpath = params.get('xpath') || undefined;
    }
    
    try {
      const domData = await this.mcpHandler.executeCommand('dom', {
        tabId,
        selector,
        xpath
      });
      
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              selector: selector || undefined,
              xpath: !selector ? xpath : undefined,
              dom: domData
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get DOM: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async readQuerySelectorResource(uri: string, match: RegExpMatchArray): Promise<any> {
    const tabId = match[1];
    const tab = this.tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    let selector: string | undefined;
    let xpath: string | undefined;
    
    const queryIndex = uri.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(uri.substring(queryIndex + 1));
      selector = params.get('selector') || undefined;
      xpath = params.get('xpath') || undefined;
    }
    
    if (!selector && !xpath) {
      throw new Error('Either selector or xpath parameter is required');
    }
    
    try {
      const result = await this.mcpHandler.executeCommand('querySelectorAll', {
        tabId,
        selector,
        xpath
      });
      
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              selector: selector || undefined,
              xpath: xpath || undefined,
              ...result
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to query selector: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async readTabResource(uri: string, match: RegExpMatchArray): Promise<any> {
    const tabId = match[1];
    const tab = this.tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    const tabInfo = {
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      connectedAt: tab.connectedAt,
      lastPing: tab.lastPing,
      domSize: tab.domSize,
      fullPageDimensions: tab.fullPageDimensions,
      viewportDimensions: tab.viewportDimensions,
      scrollPosition: tab.scrollPosition,
      pageVisibility: tab.pageVisibility
    };
    
    return {
      contents: [
        {
          uri: uri,
          mimeType: 'application/json',
          text: JSON.stringify(tabInfo, null, 2)
        }
      ]
    };
  }

  // Shared prompt logic
  private getPrompt(name: string, args: any): any {
    const prompt = this.prompts.find(p => p.name === name);
    if (!prompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }
    
    if (name === 'list-tabs') {
      const tabsData = this.mcpHandler.listTabs();
      const tabsArray = tabsData.tabs || [];
      
      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Please list all available browser tabs connected to Kapture.'
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: tabsArray.length === 0 
                ? `No browser tabs are currently connected to Kapture.

To connect a browser tab:
1. Make sure the Kapture Chrome extension is installed
2. Open Chrome DevTools (F12 or right-click → Inspect)
3. Navigate to the "Kapture" panel in DevTools
4. The tab will automatically connect to this server

The server is running on port ${this.port} and waiting for connections.`
                : `Found ${tabsArray.length} connected browser tab${tabsArray.length === 1 ? '' : 's'}:

${tabsArray.map((tab: any, index: number) => 
`${index + 1}. Tab ID: ${tab.tabId}
   URL: ${tab.url || 'about:blank'}
   Title: ${tab.title || 'New Tab'}
   Connected: ${new Date(tab.connectedAt).toLocaleString()}`
).join('\n\n')}

You can use these tab IDs with other Kapture tools like navigate, click, fill, etc.`
            }
          }
        ]
      };
    }
    
    if (name === 'tab-details') {
      if (!args?.tabId) {
        throw new Error('tabId argument is required');
      }
      
      const tab = this.tabRegistry.get(args.tabId);
      if (!tab) {
        throw new Error(`Tab ${args.tabId} not found`);
      }
      
      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Show me detailed information about tab ${args.tabId}.`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `Here are the details for tab ${args.tabId}:

**Basic Information:**
- URL: ${tab.url || 'about:blank'}
- Title: ${tab.title || 'New Tab'}
- Tab ID: ${tab.tabId}
- Connected: ${new Date(tab.connectedAt).toLocaleString()}
- Last Active: ${tab.lastPing ? new Date(tab.lastPing).toLocaleString() : 'Unknown'}

**Page Dimensions:**
- Viewport: ${tab.viewportDimensions ? `${tab.viewportDimensions.width}×${tab.viewportDimensions.height}` : 'Unknown'}
- Full Page: ${tab.fullPageDimensions ? `${tab.fullPageDimensions.width}×${tab.fullPageDimensions.height}` : 'Unknown'}
- Scroll Position: ${tab.scrollPosition ? `(${tab.scrollPosition.x}, ${tab.scrollPosition.y})` : 'Unknown'}

**Page Status:**
- Visibility: ${tab.pageVisibility || 'Unknown'}
- DOM Size: ${tab.domSize ? `${tab.domSize.toLocaleString()} nodes` : 'Unknown'}

You can interact with this tab using tools like:
- \`navigate\` to go to a different URL
- \`click\`, \`fill\`, \`select\` for form interactions
- \`screenshot\` to capture the page
- \`evaluate\` to run JavaScript`
            }
          }
        ]
      };
    }
    
    if (name === 'navigate-to-url') {
      if (!args?.tabId) {
        throw new Error('tabId argument is required');
      }
      if (!args?.url) {
        throw new Error('url argument is required');
      }
      
      const tab = this.tabRegistry.get(args.tabId);
      if (!tab) {
        throw new Error(`Tab ${args.tabId} not found`);
      }
      
      let targetUrl = args.url;
      if (!targetUrl.match(/^https?:\/\//i)) {
        targetUrl = `https://${targetUrl}`;
      }
      
      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Navigate tab ${args.tabId} to ${args.url}`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll navigate the browser tab to ${targetUrl}.

**Current Tab State:**
- Tab ID: ${tab.tabId}
- Current URL: ${tab.url || 'about:blank'}
- Current Title: ${tab.title || 'New Tab'}

**Navigation Plan:**
1. Navigate to: ${targetUrl}
2. Wait for page to fully load
3. Confirm navigation success

To execute this navigation, use the \`navigate\` tool:
\`\`\`json
{
  "tool": "navigate",
  "arguments": {
    "tabId": "${args.tabId}",
    "url": "${targetUrl}"
  }
}
\`\`\`

**What happens next:**
- The browser will navigate to the new URL
- The page will load completely before the tool returns
- You'll receive the new page title and URL in the response
- If navigation fails, you'll get an error message

**Follow-up actions you might want:**
- Use \`screenshot\` to capture the loaded page
- Use \`evaluate\` to check page content
- Use \`click\` or \`fill\` to interact with page elements`
            }
          }
        ]
      };
    }
    
    if (name === 'take-screenshot') {
      if (!args?.tabId) {
        throw new Error('tabId argument is required');
      }
      
      const tab = this.tabRegistry.get(args.tabId);
      if (!tab) {
        throw new Error(`Tab ${args.tabId} not found`);
      }
      
      const selector = args.selector || null;
      const scale = args.scale || 0.3;
      const format = args.format || 'webp';
      const quality = format === 'png' ? 1.0 : 0.85;
      
      const validScale = Math.min(Math.max(typeof scale === 'string' ? parseFloat(scale) : scale, 0.1), 1.0);
      const validFormats = ['webp', 'jpeg', 'png'];
      const validFormat = validFormats.includes(format) ? format : 'webp';
      
      return {
        description: prompt.description,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: selector 
                ? `Take a screenshot of the element matching "${selector}" in tab ${args.tabId}`
                : `Take a screenshot of tab ${args.tabId}`
            }
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll capture a screenshot of ${selector ? `the element matching "${selector}"` : 'the entire page'} from tab ${args.tabId}.

**Current Tab:**
- Tab ID: ${tab.tabId}
- URL: ${tab.url || 'about:blank'}
- Title: ${tab.title || 'New Tab'}

**Screenshot Configuration:**
- Target: ${selector ? `Element with selector "${selector}"` : 'Full page'}
- Scale: ${validScale} (${Math.round(validScale * 100)}% of original size)
- Format: ${validFormat.toUpperCase()}
- Quality: ${quality === 1.0 ? 'Maximum' : `${Math.round(quality * 100)}%`}

**To capture the screenshot, use the \`screenshot\` tool:**
\`\`\`json
{
  "tool": "screenshot",
  "arguments": {
    "tabId": "${args.tabId}"${selector ? `,
    "selector": "${selector}"` : ''},
    "scale": ${validScale},
    "format": "${validFormat}",
    "quality": ${quality}
  }
}
\`\`\`

**What you'll receive:**
- A base64-encoded image in the response
- The image will be displayed directly in the interface
- Format: ${validFormat.toUpperCase()} image data

**Tips:**
${selector ? `- Make sure the element is visible on the page
- If the element is not found, the tool will return an error
- Use specific selectors like "#id" or ".class" for best results` : 
`- The screenshot captures the entire scrollable page content
- Large pages may take longer to capture
- Consider using a selector to capture specific sections`}

**Common use cases:**
- Document visual state of a page
- Capture form data before submission
- Save error messages or important information
- Create visual comparisons of page changes`
            }
          }
        ]
      };
    }
    
    throw new Error(`Prompt ${name} not implemented`);
  }
}