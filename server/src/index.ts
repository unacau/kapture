import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { TabRegistry } from './tab-registry.js';
import { WebSocketManager } from './websocket-manager.js';
import { MCPHandler } from './mcp-handler.js';
import { MCPServerManager } from './mcp-server-manager.js';
import { logger } from './logger.js';

// Set process title for better identification
process.title = 'Kapture MCP Server';

// Fixed port - no command line arguments
const PORT = 61822;

// Initialize tab registry
const tabRegistry = new TabRegistry();

// MCP Server Manager instance
let mcpServerManager: MCPServerManager;

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
    // Always return 200 OK with server status
    res.writeHead(200, { 'Content-Type': 'application/json' });
    
    const connections = mcpServerManager?.getConnectionInfo() || [];
    if (connections.length > 0) {
      // MCP clients are connected
      res.end(JSON.stringify({
        mcpClients: connections,
        connectionCount: connections.length
      }));
    } else {
      // MCP client not connected yet, but server is running
      res.end(JSON.stringify({
        mcpClients: [],
        connectionCount: 0,
        status: 'waiting',
        message: 'Kapture MCP server is running, waiting for MCP client connections'
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

// Initialize WebSocket server with noServer option to handle upgrades manually
const wss = new WebSocketServer({ noServer: true });

// Add error handling for HTTP server
httpServer.on('error', (error) => {
  logger.error('HTTP server error:', error);
  process.exit(1);
});

// Handle WebSocket upgrade requests
httpServer.on('upgrade', (request, socket, head) => {
  // Allow all WebSocket upgrades now that we support multiple connections
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
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

// Handler for resource endpoints
const handleResourceEndpoint = async (resourcePath: string, queryString?: string): Promise<{ content: string | Buffer; mimeType: string } | null> => {
  try {
    // Check if it's a screenshot view resource
    const screenshotViewMatch = resourcePath.match(/^tab\/(.+)\/screenshot\/view$/);
    if (screenshotViewMatch) {
      const tabId = screenshotViewMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        try {
          // Parse query parameters
          let selector: string | undefined;
          let xpath: string | undefined;
          let scale = 0.3;
          let format: 'webp' | 'jpeg' | 'png' = 'webp';
          let quality = 0.85;
          
          if (queryString) {
            const params = new URLSearchParams(queryString);
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
          
          // Execute screenshot command
          const screenshotData = await mcpHandler.executeCommand('screenshot', {
            tabId,
            selector,
            xpath,
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
  } catch (error) {
    logger.error('Error reading resource:', error);
  }
  
  return null;
};

// Initialize MCP Server Manager
mcpServerManager = new MCPServerManager(
  wsManager,
  tabRegistry,
  mcpHandler,
  PORT,
  handleResourceEndpoint
);

// Handle MCP WebSocket connections
wss.on('connection', (ws, request) => {
  const url = request.url || '';
  
  if (url === '/mcp') {
    // Handle MCP WebSocket connection
    mcpServerManager.connectWebSocket(ws).catch(error => {
      logger.error('Failed to connect MCP WebSocket:', error);
      ws.close();
    });
  } else {
    // Handle browser extension WebSocket connections
    // This is handled by wsManager in its constructor
  }
});

// Start the MCP server with stdio transport
async function startServer() {
  try {
    // Connect stdio MCP server
    await mcpServerManager.connectStdio();
    
    logger.log('MCP server started');
    logger.log(`HTTP endpoints available at http://localhost:${PORT}/`);
    logger.log(`Resource endpoints: http://localhost:${PORT}/tabs`);
    logger.log(`Dynamic tab endpoints: http://localhost:${PORT}/tab/{tabId}`);
    logger.log(`Console log endpoints: http://localhost:${PORT}/tab/{tabId}/console`);
    logger.log(`Screenshot endpoints: http://localhost:${PORT}/tab/{tabId}/screenshot`);
    logger.log(`Screenshot view endpoints: http://localhost:${PORT}/tab/{tabId}/screenshot/view`);
    logger.log(`Elements at point endpoints: http://localhost:${PORT}/tab/{tabId}/elementsFromPoint?x={x}&y={y}`);
    logger.log(`DOM endpoints: http://localhost:${PORT}/tab/{tabId}/dom`);
    logger.log(`Elements endpoints: http://localhost:${PORT}/tab/{tabId}/elements?selector={selector}&visible={true|false|all}`);
    logger.log(`MCP WebSocket endpoint: ws://localhost:${PORT}/mcp`);
    logger.log('Multiple MCP clients can now connect simultaneously');
    // Server is ready
  } catch (error) {
    logger.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

startServer();

// Handle server shutdown via SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  logger.log('Received SIGINT - shutting down server');
  
  // Clean up resources
  mcpHandler.cleanup();
  wsManager.shutdown();
  
  // Close HTTP server
  httpServer.close(() => {
    logger.log('HTTP server closed via SIGINT');
    process.exit(0);
  });
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('SIGINT shutdown timeout - forcing exit');
    process.exit(0);
  }, 5000);
});