import { spawn, exec } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import WebSocket from 'ws';
import {delay} from "./test/helpers.js";

// Make WebSocket available globally for the MCP SDK
globalThis.WebSocket = WebSocket;

class TestFramework {
  constructor() {
    this.mcpClient = null;
    this.serverPort = 61822;
    this.testTab = null; // Store the test tab for the entire test run
  }

  async startServer() {
    console.log('Starting server...');
    const serverProcess = spawn('npm', ['start'], {
      cwd: '../server',
      env: { ...process.env, KAPTURE_DEBUG: '1' },
      detached: true,  // Run independently of parent
      stdio: 'ignore'  // Don't inherit stdio
    });

    serverProcess.unref(); // Allow parent to exit without killing child
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

    if (name !== 'list_tabs' && !args.tabId) {
      args.tabId = this.testTab.tabId;
    }
    return await this.mcpClient.callTool({ name, arguments: args});
  }

  async callToolAndParse(name, args) {
    const result = await this.callTool(name, args);
    return JSON.parse(result.content[0].text);
  }

  async readResource(uri) {
    if (!this.mcpClient) {
      throw new Error('MCP client not connected');
    }

    return await this.mcpClient.readResource({ uri });
  }


  async openTestPage() {
    // Launch Chrome with the test page
    // const { exec } = await import('child_process');
    const id = Date.now().toString();
    const testUrl = `http://localhost:${this.serverPort}/test.html?id=${id}`;

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
        await new Promise(resolve => setTimeout(resolve, 500));
        return id;
      } catch (e) {
        // Try next command
      }
    }

    throw new Error('Failed to launch Chrome. Please open test.html manually.');
  }

  async ensureTestTab() {
    // If we already have a test tab for this test run, use it
    if (this.testTab) {
      return this.testTab;
    }

    // Open a new tab for this test run
    console.log('Opening new test tab...');
    const id = await this.openTestPage();

    // Keep trying to find the test tab
    for (let i = 0; i < 10; i++) {
      const tabs = (await this.callToolAndParse('list_tabs', {})).tabs;
      for (const tab of tabs) {
        if (tab.url.includes('/test.html?id=') && tab.url.includes(id)) {
          this.testTab = tab; // Store for reuse
          return;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Chrome launched but test tab not found. Make sure Kapture extension is installed.');
  }
  async cleanup() {
    if (this.mcpClient) {
      await this.mcpClient.close();
      this.mcpClient = null;
    }
  }
}

// Create a single instance to be shared across all test files
export const framework = new TestFramework();

// Start server
await framework.startServer();
await delay(1000); // Wait for server to start

// Connect MCP client
console.log('Connecting MCP client...');
await framework.connectMCP();

await framework.ensureTestTab();
