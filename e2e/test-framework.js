import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import WebSocket from 'ws';

// Make WebSocket available globally for the MCP SDK
globalThis.WebSocket = WebSocket;

export class TestFramework {
  constructor() {
    this.serverProcess = null;
    this.mcpClient = null;
    this.serverPort = 61822;
  }

  async checkServerRunning() {
    try {
      const response = await fetch(`http://localhost:${this.serverPort}/`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async startServer() {
    // Check if server is already running
    const isRunning = await this.checkServerRunning();
    if (isRunning) {
      console.log('Server is already running on port', this.serverPort);
      return;
    }

    return new Promise((resolve, reject) => {
      // Start the server
      this.serverProcess = spawn('npm', ['start'], {
        cwd: '../server',
        env: { ...process.env, KAPTURE_DEBUG: '1' }
      });

      let serverReady = false;

      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Server:', output);
        
        // Check if server is ready
        if (!serverReady && output.includes('WebSocket server listening')) {
          serverReady = true;
          // Give it a moment to fully initialize
          setTimeout(() => resolve(), 1000);
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error('Server Error:', error);
        
        // Check for port in use error
        if (error.includes('EADDRINUSE')) {
          reject(new Error(`Port ${this.serverPort} is already in use. Kill the existing process or use a different port.`));
        }
      });

      this.serverProcess.on('error', (error) => {
        reject(new Error(`Failed to start server: ${error.message}`));
      });

      // Timeout if server doesn't start
      setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server failed to start within timeout'));
        }
      }, 10000);
    });
  }

  async stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async connectMCP() {
    const transport = new WebSocketClientTransport(new URL(`ws://localhost:${this.serverPort}/mcp`));
    
    this.mcpClient = new Client({
      name: 'kapture-e2e-test',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await this.mcpClient.connect(transport);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return this.mcpClient;
  }

  async disconnectMCP() {
    if (this.mcpClient) {
      await this.mcpClient.close();
      this.mcpClient = null;
    }
  }

  async listResources() {
    if (!this.mcpClient) {
      throw new Error('MCP client not connected');
    }
    
    const response = await this.mcpClient.listResources();
    return response.resources;
  }

  async listTools() {
    if (!this.mcpClient) {
      throw new Error('MCP client not connected');
    }
    
    const response = await this.mcpClient.listTools();
    return response.tools;
  }

  async callTool(name, args) {
    if (!this.mcpClient) {
      throw new Error('MCP client not connected');
    }
    
    const response = await this.mcpClient.callTool({ name, arguments: args });
    return response;
  }

  async readResource(uri) {
    if (!this.mcpClient) {
      throw new Error('MCP client not connected');
    }
    
    const response = await this.mcpClient.readResource({ uri });
    return response;
  }

  async findTestTab(resources) {
    // Look for a tab running test.html
    const tabsResource = resources.find(r => r.uri === 'kapture://tabs');
    if (!tabsResource) {
      throw new Error('No tabs resource found');
    }

    const tabsResponse = await this.readResource('kapture://tabs');
    const tabs = JSON.parse(tabsResponse.contents[0].text);

    // Find test.html tab
    return tabs.find(tab => tab.url && tab.url.includes('test.html'));
  }

  async openTestPage() {
    // Launch Chrome with the test page
    const { exec } = await import('child_process');
    const testUrl = `http://localhost:${this.serverPort}/test.html?kapture-connect=true`;
    
    // Try to open Chrome (different commands for different OS)
    const commands = [
      `open -a "Google Chrome" "${testUrl}"`, // macOS
      `google-chrome "${testUrl}"`, // Linux
      `start chrome "${testUrl}"` // Windows
    ];
    
    for (const cmd of commands) {
      try {
        exec(cmd);
        console.log('Launched Chrome with test page');
        // Wait for Chrome to open and extension to connect
        await new Promise(resolve => setTimeout(resolve, 5000));
        return;
      } catch (e) {
        // Try next command
      }
    }
    
    throw new Error('Failed to launch Chrome. Please open test.html manually.');
  }

  async ensureTestTab() {
    const resources = await this.listResources();
    let testTab = await this.findTestTab(resources);
    
    if (!testTab) {
      console.log('No test tab found, launching Chrome...');
      await this.openTestPage();
      
      // Keep trying to find the test tab
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const updatedResources = await this.listResources();
        testTab = await this.findTestTab(updatedResources);
        if (testTab) break;
      }
      
      if (!testTab) {
        throw new Error('Chrome launched but test tab not found. Make sure Kapture extension is installed.');
      }
    }
    
    return testTab;
  }

  async cleanup() {
    await this.disconnectMCP();
    await this.stopServer();
  }
}