import { WebSocket } from 'ws';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebSocketTransport } from './websocket-transport.js';
import { logger } from './logger.js';

export class MCPWebSocketHandler {
  private connections: Map<WebSocket, { transport: WebSocketTransport; connectionId: string }> = new Map();

  constructor(private mcpServer: Server) {}

  async handleConnection(ws: WebSocket): Promise<void> {
    logger.log('New MCP WebSocket client connected');
    
    // Create a unique connection ID
    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create transport for this WebSocket connection
    const transport = new WebSocketTransport(ws);
    
    // Store the connection
    this.connections.set(ws, { transport, connectionId });
    
    try {
      // Connect the server to this transport
      await this.mcpServer.connect(transport);
      logger.log(`MCP server connected to WebSocket transport (${connectionId})`);
    } catch (error) {
      logger.error(`Failed to connect MCP server to WebSocket transport (${connectionId}):`, error);
      ws.close();
    }
    
    // Clean up on close
    ws.on('close', () => {
      logger.log(`MCP WebSocket client disconnected (${connectionId})`);
      this.connections.delete(ws);
    });
  }
}