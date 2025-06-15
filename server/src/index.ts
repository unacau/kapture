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
let handleResourceEndpoint: ((path: string) => Promise<{ content: string; mimeType: string } | null>) | null = null;

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
    // Remove leading slash
    const resourcePath = req.url.substring(1);
    
    try {
      const result = await handleResourceEndpoint(resourcePath);
      if (result) {
        res.writeHead(200, { 
          'Content-Type': result.mimeType 
        });
        res.end(result.content);
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
const availableResources = [
  {
    uri: 'kapture://tabs',
    name: 'Connected Browser Tabs',
    description: 'List of all browser tabs connected to the Kapture server',
    mimeType: 'application/json'
  }
];

// Register handler for listing resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: availableResources
  };
});

// Register handler for reading resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  if (uri === 'kapture://tabs') {
    // Get the tabs array only
    const tabsData = mcpHandler.listTabs();
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
      viewportDimensions: tab.viewportDimensions
    }));
    
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

// Set up tab connect notification
tabRegistry.setConnectCallback(async (tabId: string) => {
  logger.log(`Tab connected: ${tabId}`);
  await sendTabListChangeNotification();
});

// Set up tab update notification
tabRegistry.setUpdateCallback(async (tabId: string) => {
  logger.log(`Tab updated: ${tabId}`);
  await sendTabListChangeNotification();
});

// Set up tab disconnect notification
tabRegistry.setDisconnectCallback(async (tabId: string) => {
  try {
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
handleResourceEndpoint = async (resourcePath: string) => {
  try {
    // Find matching resource
    const matchingResource = availableResources.find((resource) => {
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
      // Add more resource handlers here as needed
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
