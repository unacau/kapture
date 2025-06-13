// Test command interface for Phase 2 testing
// This will be replaced with proper MCP integration in Phase 4

import { WebSocketManager } from './websocket-manager.js';
import { TabRegistry } from './tab-registry.js';
import { logger } from './logger.js';
import { createServer } from 'http';

interface PendingCommand {
  resolve: (result: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
}

const pendingCommands = new Map<string, PendingCommand>();

export function setupTestEndpoint(wsManager: WebSocketManager, tabRegistry: TabRegistry, port: number = 8080) {
  // REMOVED: Response handler setup - this was overwriting the MCP handler
  // The test endpoint is deprecated and should not interfere with MCP operation
  const server = createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url!, `http://localhost:${port}`);

    // List connected tabs
    if (url.pathname === '/tabs' && req.method === 'GET') {
      const tabs = tabRegistry.getAll().map(tab => ({
        tabId: tab.tabId,
        url: tab.url,
        title: tab.title,
        connectedAt: tab.connectedAt
      }));
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tabs }));
      return;
    }


    // Send command to tab
    if (url.pathname === '/command' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { tabId, command, params } = JSON.parse(body);
          
          if (!tabId || !command) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'tabId and command are required' }));
            return;
          }

          const commandId = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const commandMessage = {
            id: commandId,
            type: 'command',
            command,
            params: params || {}
          };

          // Create promise to wait for response
          const responsePromise = new Promise<any>((resolve, reject) => {
            const timeout = setTimeout(() => {
              pendingCommands.delete(commandId);
              reject(new Error('Command timeout'));
            }, params?.timeout || 30000);
            
            pendingCommands.set(commandId, { resolve, reject, timeout });
          });

          try {
            // Send command
            wsManager.sendCommand(tabId, commandMessage);
            
            // Wait for response
            const result = await responsePromise;
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              commandId,
              result 
            }));
          } catch (error: any) {
            res.writeHead(error.message.includes('not found') ? 404 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: error.message 
            }));
          }
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // Default response
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, () => {
    logger.log(`Test HTTP endpoint listening on http://localhost:${port}`);
    logger.log('Available endpoints:');
    logger.log(`  GET  http://localhost:${port}/tabs - List connected tabs`);
    logger.log(`  POST http://localhost:${port}/command - Send command to tab`);
  });

  // Clean up pending commands on server close
  server.on('close', () => {
    for (const [commandId, pending] of pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Server shutting down'));
    }
    pendingCommands.clear();
  });

  return server;
}