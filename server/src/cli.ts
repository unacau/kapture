#!/usr/bin/env node

// CLI entry point for running Kapture MCP server with npx
// This wrapper checks if a server is already running and handles it appropriately

import { logger } from './logger.js';

// Check if server is already running on port 61822
async function checkExistingServer(): Promise<{ exists: boolean; mcpClients?: any[] }> {
  try {
    const response = await fetch('http://localhost:61822/', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(1000) // 1 second timeout
    });
    
    if (response.ok) {
      const data = await response.json() as any;
      // Check if this is our Kapture server
      if ('mcpClients' in data || 'status' in data) {
        return { exists: true, mcpClients: data.mcpClients || [] };
      }
    }
    return { exists: false };
  } catch (error) {
    // Server is not running or not reachable
    return { exists: false };
  }
}

async function main() {
  try {
    const serverCheck = await checkExistingServer();
    
    if (serverCheck.exists) {
      // Server is already running
      logger.log('Kapture MCP server is already running on port 61822');
      
      if (serverCheck.mcpClients && serverCheck.mcpClients.length > 0) {
        logger.log(`Connected MCP clients: ${serverCheck.mcpClients.length}`);
        serverCheck.mcpClients.forEach((client, index) => {
          logger.log(`  ${index + 1}. ${client.name || 'Unknown'} (${client.type})`);
        });
      }
      
      logger.log('');
      logger.log('To connect additional MCP clients:');
      logger.log('  - First client: Use stdio connection (npx kapture-mcp-server)');
      logger.log('  - Additional clients: Use WebSocket connection to ws://localhost:61822/mcp');
      logger.log('');
      logger.log('All clients will share the same browser tabs.');
      
      // Exit gracefully - the server is already running
      process.exit(0);
    }
    
    // No existing server, start normally
    logger.log('Starting new Kapture MCP server on port 61822...');
    await import('./index.js');
    
  } catch (error) {
    logger.error('Failed to start Kapture MCP server:', error);
    process.exit(1);
  }
}

// Run the main function
main();