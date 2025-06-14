import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema,
  InitializeRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { WebSocketServer } from 'ws';
import { TabRegistry } from './tab-registry.js';
import { WebSocketManager } from './websocket-manager.js';
import { MCPHandler } from './mcp-handler.js';
import { setupTestEndpoint } from './test-commands.js';
import { allTools } from './tools/index.js';
import { zodToJsonSchema } from './tools/schema-converter.js';
import { logger } from './logger.js';

const PORT = 61822;

// Initialize tab registry
const tabRegistry = new TabRegistry();

// Initialize WebSocket server for Chrome Extension connections
const wss = new WebSocketServer({ port: PORT });

// Add error handling for WebSocket server
wss.on('error', (error) => {
  logger.error('WebSocket server error:', error);
  process.exit(1);
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
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Setup test HTTP endpoint for Phase 2 testing
const testServer = setupTestEndpoint(wsManager, tabRegistry);

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
  testServer.close();
  wsManager.shutdown();
  wss.close(() => {
    process.exit(0);
  });
});