import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  InitializeRequestSchema
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

// Create HTTP server for both discovery endpoint and WebSocket
const httpServer = createServer((req, res) => {
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
      tools: {}
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
  } catch (error) {
    logger.error(`Failed to send disconnect notification for tab ${tabId}:`, error);
  }
});

// Start the MCP server with stdio transport
async function startServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.log('MCP server started');
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
