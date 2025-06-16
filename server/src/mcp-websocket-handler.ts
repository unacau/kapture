import { WebSocket } from 'ws';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { logger } from './logger.js';

export class MCPWebSocketHandler {
  private clients: Map<WebSocket, { id: number }> = new Map();

  constructor(private mcpServer: Server) {}

  handleConnection(ws: WebSocket): void {
    logger.log('New MCP WebSocket client connected');
    
    // Initialize client state
    this.clients.set(ws, { id: 0 });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        logger.log(`MCP WebSocket received: ${JSON.stringify(message)}`);
        
        // Handle JSON-RPC request through the MCP server
        const response = await this.handleMCPRequest(message);
        
        // Send response back over WebSocket
        ws.send(JSON.stringify(response));
        logger.log(`MCP WebSocket sent: ${JSON.stringify(response)}`);
      } catch (error: any) {
        logger.error('MCP WebSocket error:', error);
        
        // Send JSON-RPC error response
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: error.message
          }
        }));
      }
    });

    ws.on('close', () => {
      logger.log('MCP WebSocket client disconnected');
      this.clients.delete(ws);
    });

    ws.on('error', (error) => {
      logger.error('MCP WebSocket error:', error);
      this.clients.delete(ws);
    });
  }

  private async handleMCPRequest(request: any): Promise<any> {
    try {
      // The MCP server expects to handle the request and return a response
      // We need to use the server's request handlers directly
      const method = request.method;
      const params = request.params || {};
      
      // Get the appropriate handler from the server
      const handlers = (this.mcpServer as any)._requestHandlers;
      const handler = handlers.get(method);
      
      if (!handler) {
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
      }

      // Call the handler with the request object
      const result = await handler({ method, params });
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        result
      };
    } catch (error: any) {
      logger.error(`MCP request error for ${request.method}:`, error);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: error.message || 'Internal error'
        }
      };
    }
  }
}