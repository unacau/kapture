import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  InitializeRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { TabRegistry } from './tab-registry.js';
import { WebSocketManager } from './websocket-manager.js';
import { MCPHandler } from './mcp-handler.js';
import { MCPWebSocketHandler } from './mcp-websocket-handler.js';
import { allTools } from './tools/index.js';
import { zodToJsonSchema } from './tools/schema-converter.js';
import { logger } from './logger.js';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let port = 61822;
  
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      const parsedPort = parseInt(args[i + 1], 10);
      if (!isNaN(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) {
        port = parsedPort;
        i++; // Skip next argument
      } else {
        logger.error(`Invalid port number: ${args[i + 1]}`);
        process.exit(1);
      }
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Kapture MCP Server');
      console.log('Usage: node dist/index.js [options]');
      console.log('');
      console.log('Options:');
      console.log('  -p, --port <number>  WebSocket port (default: 61822)');
      console.log('  -h, --help          Show this help message');
      process.exit(0);
    }
  }
  
  return { port };
}

const { port: PORT } = parseArgs();

// Initialize tab registry with disconnect callback
const tabRegistry = new TabRegistry();

// Store handler for resource endpoints
let handleResourceEndpoint: ((path: string, queryString?: string) => Promise<{ content: string | Buffer; mimeType: string } | null>) | null = null;

// Create HTTP server for both discovery endpoint and WebSocket
const httpServer = createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Discovery endpoint
  if (req.url === '/' && req.method === 'GET') {
    // Only return server info if MCP client has connected
    if (mcpClientInfo.name) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mcpClient: mcpClientInfo
      }));
    } else {
      // Return 503 Service Unavailable if no MCP client connected yet
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'MCP client not connected',
        status: 'waiting'
      }));
    }
    return;
  }

  // Check if URL matches a resource endpoint pattern
  if (req.url && req.url !== '/' && req.method === 'GET' && handleResourceEndpoint) {
    // Parse URL to separate path and query string
    const urlParts = req.url.split('?');
    const resourcePath = urlParts[0].substring(1); // Remove leading slash
    const queryString = urlParts[1] || '';
    
    try {
      const result = await handleResourceEndpoint(resourcePath, queryString);
      if (result) {
        res.writeHead(200, { 
          'Content-Type': result.mimeType 
        });
        // Handle binary content (e.g., images)
        if (Buffer.isBuffer(result.content)) {
          res.end(result.content);
        } else {
          res.end(result.content);
        }
        return;
      }
    } catch (error) {
      logger.error('Error handling resource endpoint:', error);
    }
  }

  // 404 for any other paths
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Initialize WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server: httpServer });

// Add error handling for HTTP server
httpServer.on('error', (error) => {
  logger.error('HTTP server error:', error);
  process.exit(1);
});

// Start listening
httpServer.listen(PORT, () => {
  logger.log(`Server listening on port ${PORT} (HTTP + WebSocket)`);
});

const wsManager = new WebSocketManager(wss, tabRegistry);

// Initialize MCP handler
const mcpHandler = new MCPHandler(wsManager, tabRegistry);


// Connect WebSocket responses to MCP handler
wsManager.setResponseHandler((response) => {
  mcpHandler.handleCommandResponse(response);
});

// Set up console log handler to send MCP notifications
wsManager.setConsoleLogHandler(async (tabId: string, logEntry: any) => {
  try {
    // Send MCP notification for console log
    await server.notification({
      method: 'kapturemcp/console_log',
      params: {
        tabId,
        logEntry,
        timestamp: Date.now()
      }
    });
    logger.log(`Sent console_log notification for tab ${tabId}`);
  } catch (error) {
    logger.error('Failed to send console_log notification:', error);
  }
});

// Store client info
let mcpClientInfo: { name?: string; version?: string } = {};

// Create MCP server
const server = new Server(
  {
    name: 'kapture-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Create MCP WebSocket handler
const mcpWebSocketHandler = new MCPWebSocketHandler(server);
wsManager.setMCPWebSocketHandler(mcpWebSocketHandler);

// Set up initialize handler to capture client info immediately
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  // Capture client info from the request
  if (request.params.clientInfo) {
    mcpClientInfo = request.params.clientInfo;
    logger.log(`MCP client connected: ${mcpClientInfo.name} v${mcpClientInfo.version}`);

    mcpHandler.setClientInfo(mcpClientInfo);
    wsManager.setMcpClientInfo(mcpClientInfo);
  }

  // Process the initialize request normally
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
      resources: {}
    },
    serverInfo: {
      name: 'kapture-mcp-server',
      version: '1.0.0'
    }
  };
});


// Register handler for listing tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema)
    }))
  };
});

// Register handler for calling tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Find the tool
  const tool = allTools.find(t => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    const result = await mcpHandler.executeCommand(name, args);
    
    // Special handling for screenshot tool
    if (name === 'kapturemcp_screenshot' && result.dataUrl) {
      // Extract the base64 data and mime type from the data URL
      const match = result.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const [, mimeType, base64Data] = match;
        return {
          content: [
            {
              type: 'image',
              data: base64Data,
              mimeType: mimeType
            }
          ]
        };
      }
    }
    
    // Default text response for other tools
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error: any) {
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

// Define available resources
const baseResources = [
  {
    uri: 'kapture://tabs',
    name: 'Connected Browser Tabs',
    description: 'List of all browser tabs connected to the Kapture server',
    mimeType: 'application/json'
  }
];

// Dynamic resources will be added/removed as tabs connect/disconnect
let dynamicTabResources: Map<string, any> = new Map();

// Register handler for listing resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // Combine base resources with dynamic tab resources
  const allResources = [
    ...baseResources,
    ...Array.from(dynamicTabResources.values())
  ];
  
  return {
    resources: allResources
  };
});

// Register handler for reading resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  if (uri === 'kapture://tabs') {
    // Get the tabs array only
    const tabsData = mcpHandler.listTabs();
    const tabsArray = tabsData.tabs || [];
    
    // Debug: Log what we're returning for resource read
    logger.log(`Resource read 'kapture://tabs' returning ${tabsArray.length} tabs`);
    if (tabsArray.length > 0) {
      logger.log(`Resource read tab data: ${JSON.stringify(tabsArray)}`);
    }
    
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
  
  // Check if it's a console resource with optional pagination
  const consoleMatch = uri.match(/^kapturemcp:\/\/tab\/(.+)\/console(?:\?.*)?$/);
  if (consoleMatch) {
    const [fullPath, tabId] = consoleMatch;
    
    // Parse query parameters for pagination and filtering
    let before: string | undefined;
    let limit = 100;
    let level: string | undefined;
    const queryMatch = uri.match(/\?(.+)$/);
    if (queryMatch) {
      const params = new URLSearchParams(queryMatch[1]);
      before = params.get('before') || undefined;
      limit = parseInt(params.get('limit') || '100', 10);
      level = params.get('level') || undefined;
      
      // Validate parameters
      if (isNaN(limit) || limit < 1) limit = 100;
      if (limit > 500) limit = 500; // Max 500 per page
      // Validate level if provided
      if (level && !['log', 'info', 'warn', 'error'].includes(level)) {
        level = undefined;
      }
    }
    
    const tab = tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    // Get console logs from the extension with pagination and filtering
    try {
      const logsData = await mcpHandler.getConsoleLogs(tabId, before, limit, level);
      
      // Add tab info and pagination info to the response
      const logs = logsData.logs || [];
      const responseData = {
        logs: logs,
        total: logsData.total || 0,
        limit: limit,
        level: level,
        // Next page cursor is the timestamp of the oldest log in this page
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
  
  // Check if it's a screenshot resource with optional query parameters
  const screenshotMatch = uri.match(/^kapturemcp:\/\/tab\/(.+)\/screenshot(?:\?.*)?$/);
  if (screenshotMatch) {
    const fullPath = screenshotMatch[0];
    const pathParts = fullPath.split('?');
    const pathMatch = pathParts[0].match(/^kapturemcp:\/\/tab\/(.+)\/screenshot$/);
    
    if (!pathMatch) {
      throw new Error(`Invalid screenshot resource URI: ${uri}`);
    }
    
    const tabId = pathMatch[1];
    const tab = tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    // Parse query parameters
    let selector: string | undefined;
    let scale = 0.3;
    let format: 'webp' | 'jpeg' | 'png' = 'webp';
    let quality = 0.85;
    
    const queryMatch = uri.match(/\?(.+)$/);
    if (queryMatch) {
      const params = new URLSearchParams(queryMatch[1]);
      selector = params.get('selector') || undefined;
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
      // Execute screenshot command with parameters
      const screenshotData = await mcpHandler.executeCommand('kapturemcp_screenshot', {
        tabId,
        selector,
        scale,
        format,
        quality
      });
      
      // Return the screenshot data as JSON
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
              screenshot: screenshotData
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Check if it's a tab-specific resource
  const tabMatch = uri.match(/^kapturemcp:\/\/tab\/(.+)$/);
  if (tabMatch) {
    const tabId = tabMatch[1];
    const tab = tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    // Return detailed information about the specific tab
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
      pageVisibility: tab.pageVisibility,
      pageLoadTimes: tab.pageLoadTimes
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
  
  throw new Error(`Unknown resource: ${uri}`);
});


// Helper function to send tab list change notification
async function sendTabListChangeNotification() {
  try {
    // Get current tabs data
    const tabs = tabRegistry.getAll().map(tab => ({
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      connectedAt: tab.connectedAt,
      lastPing: tab.lastPing,
      domSize: tab.domSize,
      fullPageDimensions: tab.fullPageDimensions,
      viewportDimensions: tab.viewportDimensions,
      scrollPosition: tab.scrollPosition,
      pageVisibility: tab.pageVisibility,
      pageLoadTimes: tab.pageLoadTimes
    }));
    
    // Debug: Log what we're sending
    logger.log(`Preparing tabs_changed notification with ${tabs.length} tabs`);
    if (tabs.length > 0) {
      logger.log(`Tab data being sent: ${JSON.stringify(tabs)}`);
    }
    
    await server.notification({
      method: 'kapturemcp/tabs_changed',
      params: {
        tabs,
        timestamp: Date.now()
      }
    });
    logger.log(`Sent tabs_changed notification with ${tabs.length} tabs`);
  } catch (error) {
    logger.error('Failed to send tabs_changed notification:', error);
  }
}

// Helper function to update tab resources
function updateTabResources(tabId: string, tabTitle: string) {
  // Add/update dynamic resource for this tab
  const tabResource = {
    uri: `kapturemcp://tab/${tabId}`,
    name: `Browser Tab: ${tabTitle}`,
    description: `Information about browser tab ${tabId}`,
    mimeType: 'application/json'
  };
  dynamicTabResources.set(tabId, tabResource);
  
  // Add/update console resource for this tab
  const consoleResource = {
    uri: `kapturemcp://tab/${tabId}/console`,
    name: `Console Logs: ${tabTitle}`,
    description: `Console log messages from browser tab ${tabId}`,
    mimeType: 'application/json'
  };
  dynamicTabResources.set(`${tabId}/console`, consoleResource);
  
  // Add/update screenshot resource for this tab
  const screenshotResource = {
    uri: `kapturemcp://tab/${tabId}/screenshot`,
    name: `Screenshot: ${tabTitle}`,
    description: `Take a screenshot of browser tab ${tabId}`,
    mimeType: 'application/json'
  };
  dynamicTabResources.set(`${tabId}/screenshot`, screenshotResource);
}

// Set up tab connect notification
tabRegistry.setConnectCallback(async (tabId: string) => {
  logger.log(`Tab connected: ${tabId}`);
  
  // Get tab info to build a better name
  const tab = tabRegistry.get(tabId);
  const tabTitle = tab?.title || `Tab ${tabId}`;
  
  // Update resources for this tab
  updateTabResources(tabId, tabTitle);
  
  // Send MCP notification that resources have changed
  try {
    await server.notification({
      method: 'notifications/resources/list_changed',
      params: {}
    });
    logger.log(`Sent resources/list_changed notification for tab ${tabId} connect`);
  } catch (error) {
    logger.error('Failed to send resources/list_changed notification:', error);
  }
  
  await sendTabListChangeNotification();
});

// Set up tab update notification
tabRegistry.setUpdateCallback(async (tabId: string) => {
  logger.log(`Tab updated: ${tabId}`);
  
  // Update the dynamic resource name if the tab exists
  if (dynamicTabResources.has(tabId)) {
    const tab = tabRegistry.get(tabId);
    const tabTitle = tab?.title || `Tab ${tabId}`;
    
    // Update resources for this tab
    updateTabResources(tabId, tabTitle);
    
    // Send MCP notification that resources have changed
    try {
      await server.notification({
        method: 'notifications/resources/list_changed',
        params: {}
      });
      logger.log(`Sent resources/list_changed notification for tab ${tabId} update`);
    } catch (error) {
      logger.error('Failed to send resources/list_changed notification:', error);
    }
  }
  
  await sendTabListChangeNotification();
});

// Set up tab disconnect notification
tabRegistry.setDisconnectCallback(async (tabId: string) => {
  try {
    // Remove the dynamic resources for this tab
    dynamicTabResources.delete(tabId);
    dynamicTabResources.delete(`${tabId}/console`);
    dynamicTabResources.delete(`${tabId}/screenshot`);
    
    // Send MCP notification that resources have changed
    await server.notification({
      method: 'notifications/resources/list_changed',
      params: {}
    });
    logger.log(`Sent resources/list_changed notification for tab ${tabId} disconnect`);
    
    await server.notification({
      method: 'kapturemcp/tab_disconnected',
      params: {
        tabId,
        timestamp: Date.now()
      }
    });
    logger.log(`Sent disconnect notification for tab ${tabId}`);
    
    // Also send the updated tab list
    await sendTabListChangeNotification();
  } catch (error) {
    logger.error(`Failed to send disconnect notification for tab ${tabId}:`, error);
  }
});

// Set up resource endpoint handler  
handleResourceEndpoint = async (resourcePath: string, queryString?: string) => {
  try {
    // Check base resources first
    const matchingResource = baseResources.find((resource) => {
      // Extract path from resource URI (e.g., "kapture://tabs" -> "tabs")
      const uriParts = resource.uri.split('://');
      if (uriParts.length === 2 && uriParts[0] === 'kapture') {
        return uriParts[1] === resourcePath;
      }
      return false;
    });
    
    if (matchingResource) {
      // Read the resource using our existing logic
      if (matchingResource.uri === 'kapture://tabs') {
        // Get the tabs array only
        const tabsData = mcpHandler.listTabs();
        const tabsArray = tabsData.tabs || [];
        
        return {
          content: JSON.stringify(tabsArray, null, 2),
          mimeType: 'application/json'
        };
      }
    }
    
    // Check if it's a screenshot view resource (e.g., "tab/123/screenshot/view?scale=0.5")
    const screenshotViewMatch = resourcePath.match(/^tab\/(.+)\/screenshot\/view$/);
    if (screenshotViewMatch) {
      const tabId = screenshotViewMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        try {
          // Parse query parameters
          let selector: string | undefined;
          let scale = 0.3;
          let format: 'webp' | 'jpeg' | 'png' = 'webp';
          let quality = 0.85;
          
          if (queryString) {
            const params = new URLSearchParams(queryString);
            selector = params.get('selector') || undefined;
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
          
          // Execute screenshot command
          const screenshotData = await mcpHandler.executeCommand('kapturemcp_screenshot', {
            tabId,
            selector,
            scale,
            format,
            quality
          });
          
          // Extract base64 data and mime type from data URL
          if (screenshotData.dataUrl) {
            const match = screenshotData.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const [, mimeType, base64Data] = match;
              const imageBuffer = Buffer.from(base64Data, 'base64');
              
              return {
                content: imageBuffer,
                mimeType: mimeType
              };
            }
          }
          
          throw new Error('Invalid screenshot data');
        } catch (error) {
          logger.error(`Failed to capture screenshot for tab ${tabId}:`, error);
          return null;
        }
      }
    }
    
    // Check if it's a screenshot resource (e.g., "tab/123/screenshot")
    const screenshotMatch = resourcePath.match(/^tab\/(.+)\/screenshot$/);
    if (screenshotMatch) {
      const tabId = screenshotMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        try {
          // Parse query parameters
          let selector: string | undefined;
          let scale = 0.3;
          let format: 'webp' | 'jpeg' | 'png' = 'webp';
          let quality = 0.85;
          
          if (queryString) {
            const params = new URLSearchParams(queryString);
            selector = params.get('selector') || undefined;
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
          
          // Execute screenshot command
          const screenshotData = await mcpHandler.executeCommand('kapturemcp_screenshot', {
            tabId,
            selector,
            scale,
            format,
            quality
          });
          
          // Return the screenshot data as JSON
          return {
            content: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              parameters: {
                selector,
                scale,
                format,
                quality
              },
              screenshot: screenshotData
            }, null, 2),
            mimeType: 'application/json'
          };
        } catch (error) {
          logger.error(`Failed to capture screenshot for tab ${tabId}:`, error);
          return null;
        }
      }
    }
    
    // Check if it's a console resource (e.g., "tab/123/console")
    const consoleMatch = resourcePath.match(/^tab\/(.+)\/console$/);
    if (consoleMatch) {
      const tabId = consoleMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        try {
          // Get console logs from the extension (first page, no before parameter)
          const logsData = await mcpHandler.getConsoleLogs(tabId, undefined, 100);
          
          // Add tab info to the response
          const logs = logsData.logs || [];
          const responseData = {
            logs: logs,
            total: logsData.total || 0,
            limit: 100,
            // Next page cursor is the timestamp of the oldest log in this page
            nextCursor: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
            tabId: tabId,
            url: tab.url,
            title: tab.title
          };
          
          return {
            content: JSON.stringify(responseData, null, 2),
            mimeType: 'application/json'
          };
        } catch (error) {
          logger.error(`Failed to get console logs for tab ${tabId}:`, error);
          return null;
        }
      }
    }
    
    // Check if it's a tab-specific resource (e.g., "tab/123")
    const tabMatch = resourcePath.match(/^tab\/(.+)$/);
    if (tabMatch) {
      const tabId = tabMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        // Return detailed information about the specific tab
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
          pageVisibility: tab.pageVisibility,
          pageLoadTimes: tab.pageLoadTimes
        };
        
        return {
          content: JSON.stringify(tabInfo, null, 2),
          mimeType: 'application/json'
        };
      }
    }
  } catch (error) {
    logger.error('Error reading resource:', error);
  }
  
  return null;
};

// Start the MCP server with stdio transport
async function startServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.log('MCP server started');
    logger.log(`HTTP endpoints available at http://localhost:${PORT}/`);
    logger.log(`Resource endpoints: http://localhost:${PORT}/tabs`);
    logger.log(`Dynamic tab endpoints: http://localhost:${PORT}/tab/{tabId}`);
    logger.log(`Console log endpoints: http://localhost:${PORT}/tab/{tabId}/console`);
    logger.log(`Screenshot endpoints: http://localhost:${PORT}/tab/{tabId}/screenshot`);
    logger.log(`Screenshot view endpoints: http://localhost:${PORT}/tab/{tabId}/screenshot/view`);
    // Server is ready
  } catch (error) {
    logger.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

startServer();

// Handle server shutdown
process.on('SIGINT', () => {
  mcpHandler.cleanup();
  wsManager.shutdown();
  httpServer.close(() => {
    process.exit(0);
  });
});
