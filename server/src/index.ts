import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  InitializeRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { TabRegistry } from './tab-registry.js';
import { WebSocketManager } from './websocket-manager.js';
import { MCPHandler } from './mcp-handler.js';
import { MCPWebSocketHandler } from './mcp-websocket-handler.js';
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
      // Use stderr for help message to avoid breaking MCP protocol on stdout
      process.stderr.write('Kapture MCP Server\n');
      process.stderr.write('Usage: node dist/index.js [options]\n');
      process.stderr.write('\n');
      process.stderr.write('Options:\n');
      process.stderr.write('  -p, --port <number>  WebSocket port (default: 61822)\n');
      process.stderr.write('  -h, --help          Show this help message\n');
      process.exit(0);
    }
  }
  
  return { port };
}

const { port: PORT } = parseArgs();

// Initialize tab registry with disconnect callback
const tabRegistry = new TabRegistry();

// Store handler for resource endpoints
let handleResourceEndpoint: ((path: string, queryString?: string) => Promise<{ content: string | Buffer; mimeType: string } | null>) | null = null;

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
    
    if (mcpClientInfo.name) {
      // MCP client is connected
      res.end(JSON.stringify({
        mcpClient: mcpClientInfo
      }));
    } else {
      // MCP client not connected yet, but server is running
      res.end(JSON.stringify({
        mcpClient: null,
        status: 'waiting',
        message: 'Kapture MCP server is running, waiting for MCP client connection'
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

// Set up console log handler to send MCP notifications
wsManager.setConsoleLogHandler(async (tabId: string, logEntry: any) => {
  // Only send notifications if client has initialized
  if (!clientInitialized) {
    logger.log('Skipping console_log notification - client not yet initialized');
    return;
  }
  
  try {
    // Send MCP notification for console log
    await server.notification({
      method: 'kapturemcp/console_log',
      params: {
        tabId,
        logEntry,
        timestamp: Date.now()
      }
    });
    logger.log(`Sent console_log notification for tab ${tabId}`);
  } catch (error) {
    logger.error('Failed to send console_log notification:', error);
  }
});

// Store client info
let mcpClientInfo: { name?: string; version?: string } = {};

// Track if client has sent notifications/initialized
let clientInitialized = false;

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
      prompts: {},
    },
  }
);

// Create MCP WebSocket handler
const mcpWebSocketHandler = new MCPWebSocketHandler(server);
wsManager.setMCPWebSocketHandler(mcpWebSocketHandler);

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
      resources: {},
      prompts: {}
    },
    serverInfo: {
      name: 'kapture-mcp-server',
      version: '1.0.0'
    }
  };
});

// Handle notifications/initialized to know when client is ready
server.oninitialized = () => {
  logger.log('Client sent notifications/initialized - client is now ready for notifications');
  clientInitialized = true;
  
  // Send any pending notifications now that client is ready
  // For example, if tabs are already connected, send the tabs_changed notification
  if (tabRegistry.getAll().length > 0) {
    sendTabListChangeNotification().catch(error => {
      logger.error('Failed to send initial tabs notification:', error);
    });
  }
};

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
    
    // Special handling for screenshot tool
    if (name === 'screenshot' && result.dataUrl) {
      // Extract the base64 data and mime type from the data URL
      const match = result.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const [, mimeType, base64Data] = match;
        return {
          content: [
            {
              type: 'image',
              data: base64Data,
              mimeType: mimeType
            }
          ]
        };
      }
    }
    
    // Default text response for other tools
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

// Define available prompts
const prompts = [
  {
    name: 'list-tabs',
    description: 'Get a list of all browser tabs connected to Kapture',
    arguments: []
  },
  {
    name: 'tab-details',
    description: 'Get detailed information about a specific browser tab',
    arguments: [
      {
        name: 'tabId',
        description: 'The ID of the tab to get details for',
        required: true
      }
    ]
  },
  {
    name: 'navigate-to-url',
    description: 'Navigate a browser tab to a specific URL',
    arguments: [
      {
        name: 'tabId',
        description: 'The ID of the tab to navigate',
        required: true
      },
      {
        name: 'url',
        description: 'The URL to navigate to',
        required: true
      }
    ]
  },
  {
    name: 'take-screenshot',
    description: 'Capture a screenshot of a browser tab or specific element',
    arguments: [
      {
        name: 'tabId',
        description: 'The ID of the tab to capture',
        required: true
      },
      {
        name: 'selector',
        description: 'CSS selector for a specific element (optional, captures full page if not provided)',
        required: false
      },
      {
        name: 'scale',
        description: 'Scale factor for the screenshot (0.1-1.0, default: 0.3)',
        required: false
      },
      {
        name: 'format',
        description: 'Image format: webp, jpeg, or png (default: webp)',
        required: false
      }
    ]
  }
];

// Register handler for listing prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: prompts
  };
});

// Register handler for getting a specific prompt
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  const prompt = prompts.find(p => p.name === name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  
  // Handle different prompts
  if (name === 'list-tabs') {
    const tabsData = mcpHandler.listTabs();
    const tabsArray = tabsData.tabs || [];
    
    return {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Please list all available browser tabs connected to Kapture.'
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: tabsArray.length === 0 
              ? `No browser tabs are currently connected to Kapture.

To connect a browser tab:
1. Make sure the Kapture Chrome extension is installed
2. Open Chrome DevTools (F12 or right-click → Inspect)
3. Navigate to the "Kapture" panel in DevTools
4. The tab will automatically connect to this server

The server is running on port ${PORT} and waiting for connections.`
              : `Found ${tabsArray.length} connected browser tab${tabsArray.length === 1 ? '' : 's'}:

${tabsArray.map((tab: any, index: number) => 
`${index + 1}. Tab ID: ${tab.tabId}
   URL: ${tab.url || 'about:blank'}
   Title: ${tab.title || 'New Tab'}
   Connected: ${new Date(tab.connectedAt).toLocaleString()}`
).join('\n\n')}

You can use these tab IDs with other Kapture tools like navigate, click, fill, etc.`
          }
        }
      ]
    };
  }
  
  if (name === 'tab-details') {
    // Validate required argument
    if (!args?.tabId) {
      throw new Error('tabId argument is required');
    }
    
    const tab = tabRegistry.get(args.tabId);
    if (!tab) {
      throw new Error(`Tab ${args.tabId} not found`);
    }
    
    return {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Show me detailed information about tab ${args.tabId}.`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Here are the details for tab ${args.tabId}:

**Basic Information:**
- URL: ${tab.url || 'about:blank'}
- Title: ${tab.title || 'New Tab'}
- Tab ID: ${tab.tabId}
- Connected: ${new Date(tab.connectedAt).toLocaleString()}
- Last Active: ${tab.lastPing ? new Date(tab.lastPing).toLocaleString() : 'Unknown'}

**Page Dimensions:**
- Viewport: ${tab.viewportDimensions ? `${tab.viewportDimensions.width}×${tab.viewportDimensions.height}` : 'Unknown'}
- Full Page: ${tab.fullPageDimensions ? `${tab.fullPageDimensions.width}×${tab.fullPageDimensions.height}` : 'Unknown'}
- Scroll Position: ${tab.scrollPosition ? `(${tab.scrollPosition.x}, ${tab.scrollPosition.y})` : 'Unknown'}

**Page Status:**
- Visibility: ${tab.pageVisibility || 'Unknown'}
- DOM Size: ${tab.domSize ? `${tab.domSize.toLocaleString()} nodes` : 'Unknown'}
${tab.pageLoadTimes ? `
**Performance Metrics:**
- DOM Content Loaded: ${tab.pageLoadTimes.domContentLoaded}ms
- Page Load Complete: ${tab.pageLoadTimes.load !== null ? `${tab.pageLoadTimes.load}ms` : 'N/A'}` : ''}

You can interact with this tab using tools like:
- \`navigate\` to go to a different URL
- \`click\`, \`fill\`, \`select\` for form interactions
- \`screenshot\` to capture the page
- \`evaluate\` to run JavaScript`
          }
        }
      ]
    };
  }
  
  if (name === 'navigate-to-url') {
    // Validate required arguments
    if (!args?.tabId) {
      throw new Error('tabId argument is required');
    }
    if (!args?.url) {
      throw new Error('url argument is required');
    }
    
    const tab = tabRegistry.get(args.tabId);
    if (!tab) {
      throw new Error(`Tab ${args.tabId} not found`);
    }
    
    // Ensure URL has a protocol
    let targetUrl = args.url;
    if (!targetUrl.match(/^https?:\/\//i)) {
      targetUrl = `https://${targetUrl}`;
    }
    
    return {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Navigate tab ${args.tabId} to ${args.url}`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `I'll navigate the browser tab to ${targetUrl}.

**Current Tab State:**
- Tab ID: ${tab.tabId}
- Current URL: ${tab.url || 'about:blank'}
- Current Title: ${tab.title || 'New Tab'}

**Navigation Plan:**
1. Navigate to: ${targetUrl}
2. Wait for page to fully load
3. Confirm navigation success

To execute this navigation, use the \`navigate\` tool:
\`\`\`json
{
  "tool": "navigate",
  "arguments": {
    "tabId": "${args.tabId}",
    "url": "${targetUrl}"
  }
}
\`\`\`

**What happens next:**
- The browser will navigate to the new URL
- The page will load completely before the tool returns
- You'll receive the new page title and URL in the response
- If navigation fails, you'll get an error message

**Follow-up actions you might want:**
- Use \`screenshot\` to capture the loaded page
- Use \`evaluate\` to check page content
- Use \`click\` or \`fill\` to interact with page elements`
          }
        }
      ]
    };
  }
  
  if (name === 'take-screenshot') {
    // Validate required argument
    if (!args?.tabId) {
      throw new Error('tabId argument is required');
    }
    
    const tab = tabRegistry.get(args.tabId);
    if (!tab) {
      throw new Error(`Tab ${args.tabId} not found`);
    }
    
    // Parse optional parameters with defaults
    const selector = args.selector || null;
    const scale = args.scale || 0.3;
    const format = args.format || 'webp';
    const quality = format === 'png' ? 1.0 : 0.85;
    
    // Validate scale
    const validScale = Math.min(Math.max(typeof scale === 'string' ? parseFloat(scale) : scale, 0.1), 1.0);
    
    // Validate format
    const validFormats = ['webp', 'jpeg', 'png'];
    const validFormat = validFormats.includes(format) ? format : 'webp';
    
    return {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: selector 
              ? `Take a screenshot of the element matching "${selector}" in tab ${args.tabId}`
              : `Take a screenshot of tab ${args.tabId}`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `I'll capture a screenshot of ${selector ? `the element matching "${selector}"` : 'the entire page'} from tab ${args.tabId}.

**Current Tab:**
- Tab ID: ${tab.tabId}
- URL: ${tab.url || 'about:blank'}
- Title: ${tab.title || 'New Tab'}

**Screenshot Configuration:**
- Target: ${selector ? `Element with selector "${selector}"` : 'Full page'}
- Scale: ${validScale} (${Math.round(validScale * 100)}% of original size)
- Format: ${validFormat.toUpperCase()}
- Quality: ${quality === 1.0 ? 'Maximum' : `${Math.round(quality * 100)}%`}

**To capture the screenshot, use the \`screenshot\` tool:**
\`\`\`json
{
  "tool": "screenshot",
  "arguments": {
    "tabId": "${args.tabId}"${selector ? `,
    "selector": "${selector}"` : ''},
    "scale": ${validScale},
    "format": "${validFormat}",
    "quality": ${quality}
  }
}
\`\`\`

**What you'll receive:**
- A base64-encoded image in the response
- The image will be displayed directly in the interface
- Format: ${validFormat.toUpperCase()} image data

**Tips:**
${selector ? `- Make sure the element is visible on the page
- If the element is not found, the tool will return an error
- Use specific selectors like "#id" or ".class" for best results` : 
`- The screenshot captures the entire scrollable page content
- Large pages may take longer to capture
- Consider using a selector to capture specific sections`}

**Common use cases:**
- Document visual state of a page
- Capture form data before submission
- Save error messages or important information
- Create visual comparisons of page changes`
          }
        }
      ]
    };
  }
  
  throw new Error(`Prompt ${name} not implemented`);
});

// Define available resources
const baseResources = [
  {
    uri: 'kapture://tabs',
    name: 'Connected Browser Tabs',
    description: 'List of all browser tabs connected to the Kapture server',
    mimeType: 'application/json'
  }
];

// Dynamic resources will be added/removed as tabs connect/disconnect
let dynamicTabResources: Map<string, any> = new Map();

// Register handler for listing resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // Combine base resources with dynamic tab resources
  const allResources = [
    ...baseResources,
    ...Array.from(dynamicTabResources.values())
  ];
  
  return {
    resources: allResources
  };
});

// Register handler for reading resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  if (uri === 'kapture://tabs') {
    // Get the tabs array only
    const tabsData = mcpHandler.listTabs();
    const tabsArray = tabsData.tabs || [];
    
    // Debug: Log what we're returning for resource read
    logger.log(`Resource read 'kapture://tabs' returning ${tabsArray.length} tabs`);
    if (tabsArray.length > 0) {
      logger.log(`Resource read tab data: ${JSON.stringify(tabsArray)}`);
    }
    
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
  
  // Check if it's a console resource with optional pagination
  const consoleMatch = uri.match(/^kapture:\/\/tab\/(.+)\/console(?:\?.*)?$/);
  if (consoleMatch) {
    const [fullPath, tabId] = consoleMatch;
    
    // Parse query parameters for pagination and filtering
    let before: string | undefined;
    let limit = 100;
    let level: string | undefined;
    const queryMatch = uri.match(/\?(.+)$/);
    if (queryMatch) {
      const params = new URLSearchParams(queryMatch[1]);
      before = params.get('before') || undefined;
      limit = parseInt(params.get('limit') || '100', 10);
      level = params.get('level') || undefined;
      
      // Validate parameters
      if (isNaN(limit) || limit < 1) limit = 100;
      if (limit > 500) limit = 500; // Max 500 per page
      // Validate level if provided
      if (level && !['log', 'info', 'warn', 'error'].includes(level)) {
        level = undefined;
      }
    }
    
    const tab = tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    // Get console logs from the extension with pagination and filtering
    try {
      const logsData = await mcpHandler.getConsoleLogs(tabId, before, limit, level);
      
      // Add tab info and pagination info to the response
      const logs = logsData.logs || [];
      const responseData = {
        logs: logs,
        total: logsData.total || 0,
        limit: limit,
        level: level,
        // Next page cursor is the timestamp of the oldest log in this page
        nextCursor: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
        tabId: tabId,
        url: tab.url,
        title: tab.title
      };
      
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get console logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Check if it's a screenshot resource with optional query parameters
  const screenshotMatch = uri.match(/^kapture:\/\/tab\/(.+)\/screenshot(?:\?.*)?$/);
  if (screenshotMatch) {
    const fullPath = screenshotMatch[0];
    const pathParts = fullPath.split('?');
    const pathMatch = pathParts[0].match(/^kapture:\/\/tab\/(.+)\/screenshot$/);
    
    if (!pathMatch) {
      throw new Error(`Invalid screenshot resource URI: ${uri}`);
    }
    
    const tabId = pathMatch[1];
    const tab = tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    // Parse query parameters
    let selector: string | undefined;
    let scale = 0.3;
    let format: 'webp' | 'jpeg' | 'png' = 'webp';
    let quality = 0.85;
    
    const queryMatch = uri.match(/\?(.+)$/);
    if (queryMatch) {
      const params = new URLSearchParams(queryMatch[1]);
      selector = params.get('selector') || undefined;
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
    
    try {
      // Execute screenshot command with parameters
      const screenshotData = await mcpHandler.executeCommand('screenshot', {
        tabId,
        selector,
        scale,
        format,
        quality
      });
      
      // Return the screenshot data as JSON
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              parameters: {
                selector,
                scale,
                format,
                quality
              },
              screenshot: screenshotData
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Check if it's an elementsFromPoint resource with optional query parameters
  const elementsMatch = uri.match(/^kapture:\/\/tab\/(.+)\/elementsFromPoint(?:\?.*)?$/);
  if (elementsMatch) {
    const tabId = elementsMatch[1];
    const tab = tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    // Parse query parameters for x and y coordinates
    let x: number | undefined;
    let y: number | undefined;
    
    const queryIndex = uri.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(uri.substring(queryIndex + 1));
      const xParam = params.get('x');
      const yParam = params.get('y');
      
      if (xParam) {
        const parsedX = parseFloat(xParam);
        if (!isNaN(parsedX)) {
          x = parsedX;
        }
      }
      
      if (yParam) {
        const parsedY = parseFloat(yParam);
        if (!isNaN(parsedY)) {
          y = parsedY;
        }
      }
    }
    
    // Validate that both x and y are provided
    if (x === undefined || y === undefined) {
      throw new Error('Both x and y coordinates are required');
    }
    
    try {
      // Execute elementsFromPoint command
      const elementsData = await mcpHandler.executeCommand('elementsFromPoint', {
        tabId,
        x,
        y
      });
      
      // Return the elements data as JSON
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              coordinates: { x, y },
              elements: elementsData
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get elements from point: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Check if it's a DOM resource with optional query parameters
  const domMatch = uri.match(/^kapture:\/\/tab\/(.+)\/dom(?:\?.*)?$/);
  if (domMatch) {
    const tabId = domMatch[1];
    const tab = tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    // Parse query parameters for selector
    let selector: string | undefined;
    
    const queryIndex = uri.indexOf('?');
    if (queryIndex !== -1) {
      const params = new URLSearchParams(uri.substring(queryIndex + 1));
      selector = params.get('selector') || undefined;
    }
    
    try {
      // Execute DOM command
      const domData = await mcpHandler.executeCommand('kapturemcp_dom', {
        tabId,
        selector
      });
      
      // Return the DOM data as JSON
      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              selector: selector || 'body',
              dom: domData
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get DOM: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Check if it's a tab-specific resource
  const tabMatch = uri.match(/^kapture:\/\/tab\/(.+)$/);
  if (tabMatch) {
    const tabId = tabMatch[1];
    const tab = tabRegistry.get(tabId);
    
    if (!tab) {
      throw new Error(`Tab ${tabId} not found`);
    }
    
    // Return detailed information about the specific tab
    const tabInfo = {
      tabId: tab.tabId,
      url: tab.url,
      title: tab.title,
      connectedAt: tab.connectedAt,
      lastPing: tab.lastPing,
      domSize: tab.domSize,
      fullPageDimensions: tab.fullPageDimensions,
      viewportDimensions: tab.viewportDimensions,
      scrollPosition: tab.scrollPosition,
      pageVisibility: tab.pageVisibility,
      pageLoadTimes: tab.pageLoadTimes
    };
    
    return {
      contents: [
        {
          uri: uri,
          mimeType: 'application/json',
          text: JSON.stringify(tabInfo, null, 2)
        }
      ]
    };
  }
  
  throw new Error(`Unknown resource: ${uri}`);
});


// Helper function to send tab list change notification
async function sendTabListChangeNotification() {
  // Only send notifications if client has initialized
  if (!clientInitialized) {
    logger.log('Skipping tabs_changed notification - client not yet initialized');
    return;
  }
  
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
      viewportDimensions: tab.viewportDimensions,
      scrollPosition: tab.scrollPosition,
      pageVisibility: tab.pageVisibility,
      pageLoadTimes: tab.pageLoadTimes
    }));
    
    // Debug: Log what we're sending
    logger.log(`Preparing tabs_changed notification with ${tabs.length} tabs`);
    if (tabs.length > 0) {
      logger.log(`Tab data being sent: ${JSON.stringify(tabs)}`);
    }
    
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

// Helper function to update tab resources
function updateTabResources(tabId: string, tabTitle: string) {
  // Add/update dynamic resource for this tab
  const tabResource = {
    uri: `kapture://tab/${tabId}`,
    name: `Browser Tab: ${tabTitle}`,
    description: `Information about browser tab ${tabId}`,
    mimeType: 'application/json'
  };
  dynamicTabResources.set(tabId, tabResource);
  
  // Add/update console resource for this tab
  const consoleResource = {
    uri: `kapture://tab/${tabId}/console`,
    name: `Console Logs: ${tabTitle}`,
    description: `Console log messages from browser tab ${tabId}`,
    mimeType: 'application/json'
  };
  dynamicTabResources.set(`${tabId}/console`, consoleResource);
  
  // Add/update screenshot resource for this tab
  const screenshotResource = {
    uri: `kapture://tab/${tabId}/screenshot`,
    name: `Screenshot: ${tabTitle}`,
    description: `Take a screenshot of browser tab ${tabId}`,
    mimeType: 'application/json'
  };
  dynamicTabResources.set(`${tabId}/screenshot`, screenshotResource);
  
  // Add/update elementsFromPoint resource for this tab
  const elementsResource = {
    uri: `kapture://tab/${tabId}/elementsFromPoint`,
    name: `Elements at Point: ${tabTitle}`,
    description: `Get information about elements at a coordinate in browser tab ${tabId}`,
    mimeType: 'application/json'
  };
  dynamicTabResources.set(`${tabId}/elementsFromPoint`, elementsResource);
  
  // Add/update DOM resource for this tab
  const domResource = {
    uri: `kapture://tab/${tabId}/dom`,
    name: `DOM: ${tabTitle}`,
    description: `Get the DOM HTML of browser tab ${tabId}`,
    mimeType: 'application/json'
  };
  dynamicTabResources.set(`${tabId}/dom`, domResource);
}

// Set up tab connect notification
tabRegistry.setConnectCallback(async (tabId: string) => {
  logger.log(`Tab connected: ${tabId}`);
  
  // Get tab info to build a better name
  const tab = tabRegistry.get(tabId);
  const tabTitle = tab?.title || `Tab ${tabId}`;
  
  // Update resources for this tab
  updateTabResources(tabId, tabTitle);
  
  // Send MCP notification that resources have changed (only if client is ready)
  if (clientInitialized) {
    try {
      await server.notification({
        method: 'notifications/resources/list_changed',
        params: {}
      });
      logger.log(`Sent resources/list_changed notification for tab ${tabId} connect`);
    } catch (error) {
      logger.error('Failed to send resources/list_changed notification:', error);
    }
    
    await sendTabListChangeNotification();
  } else {
    logger.log('Skipping connect notifications - client not yet initialized');
  }
});

// Set up tab update notification
tabRegistry.setUpdateCallback(async (tabId: string) => {
  logger.log(`Tab updated: ${tabId}`);
  
  // Update the dynamic resource name if the tab exists
  if (dynamicTabResources.has(tabId)) {
    const tab = tabRegistry.get(tabId);
    const tabTitle = tab?.title || `Tab ${tabId}`;
    
    // Update resources for this tab
    updateTabResources(tabId, tabTitle);
    
    // Send MCP notification that resources have changed (only if client is ready)
    if (clientInitialized) {
      try {
        await server.notification({
          method: 'notifications/resources/list_changed',
          params: {}
        });
        logger.log(`Sent resources/list_changed notification for tab ${tabId} update`);
      } catch (error) {
        logger.error('Failed to send resources/list_changed notification:', error);
      }
    } else {
      logger.log('Skipping update notification - client not yet initialized');
    }
  }
  
  await sendTabListChangeNotification();
});

// Set up tab disconnect notification
tabRegistry.setDisconnectCallback(async (tabId: string) => {
  // Remove the dynamic resources for this tab
  dynamicTabResources.delete(tabId);
  dynamicTabResources.delete(`${tabId}/console`);
  dynamicTabResources.delete(`${tabId}/screenshot`);
  dynamicTabResources.delete(`${tabId}/elementsFromPoint`);
  dynamicTabResources.delete(`${tabId}/dom`);
  
  // Only send notifications if client is ready
  if (clientInitialized) {
    try {
      // Send MCP notification that resources have changed
      await server.notification({
        method: 'notifications/resources/list_changed',
        params: {}
      });
      logger.log(`Sent resources/list_changed notification for tab ${tabId} disconnect`);
      
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
  } else {
    logger.log(`Tab ${tabId} disconnected but skipping notifications - client not yet initialized`);
  }
});

// Set up resource endpoint handler  
handleResourceEndpoint = async (resourcePath: string, queryString?: string) => {
  try {
    // Check base resources first
    const matchingResource = baseResources.find((resource) => {
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
    }
    
    // Check if it's a screenshot view resource (e.g., "tab/123/screenshot/view?scale=0.5")
    const screenshotViewMatch = resourcePath.match(/^tab\/(.+)\/screenshot\/view$/);
    if (screenshotViewMatch) {
      const tabId = screenshotViewMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        try {
          // Parse query parameters
          let selector: string | undefined;
          let scale = 0.3;
          let format: 'webp' | 'jpeg' | 'png' = 'webp';
          let quality = 0.85;
          
          if (queryString) {
            const params = new URLSearchParams(queryString);
            selector = params.get('selector') || undefined;
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
    
    // Check if it's a screenshot resource (e.g., "tab/123/screenshot")
    const screenshotMatch = resourcePath.match(/^tab\/(.+)\/screenshot$/);
    if (screenshotMatch) {
      const tabId = screenshotMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        try {
          // Parse query parameters
          let selector: string | undefined;
          let scale = 0.3;
          let format: 'webp' | 'jpeg' | 'png' = 'webp';
          let quality = 0.85;
          
          if (queryString) {
            const params = new URLSearchParams(queryString);
            selector = params.get('selector') || undefined;
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
            scale,
            format,
            quality
          });
          
          // Return the screenshot data as JSON
          return {
            content: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              parameters: {
                selector,
                scale,
                format,
                quality
              },
              screenshot: screenshotData
            }, null, 2),
            mimeType: 'application/json'
          };
        } catch (error) {
          logger.error(`Failed to capture screenshot for tab ${tabId}:`, error);
          return null;
        }
      }
    }
    
    // Check if it's a console resource (e.g., "tab/123/console")
    const consoleMatch = resourcePath.match(/^tab\/(.+)\/console$/);
    if (consoleMatch) {
      const tabId = consoleMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        try {
          // Get console logs from the extension (first page, no before parameter)
          const logsData = await mcpHandler.getConsoleLogs(tabId, undefined, 100);
          
          // Add tab info to the response
          const logs = logsData.logs || [];
          const responseData = {
            logs: logs,
            total: logsData.total || 0,
            limit: 100,
            // Next page cursor is the timestamp of the oldest log in this page
            nextCursor: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
            tabId: tabId,
            url: tab.url,
            title: tab.title
          };
          
          return {
            content: JSON.stringify(responseData, null, 2),
            mimeType: 'application/json'
          };
        } catch (error) {
          logger.error(`Failed to get console logs for tab ${tabId}:`, error);
          return null;
        }
      }
    }
    
    // Check if it's an elementsFromPoint resource (e.g., "tab/123/elementsFromPoint?x=100&y=200")
    const elementsMatch = resourcePath.match(/^tab\/(.+)\/elementsFromPoint$/);
    if (elementsMatch) {
      const tabId = elementsMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        try {
          // Parse query parameters for x and y coordinates
          let x: number | undefined;
          let y: number | undefined;
          
          if (queryString) {
            const params = new URLSearchParams(queryString);
            const xParam = params.get('x');
            const yParam = params.get('y');
            
            if (xParam) {
              const parsedX = parseFloat(xParam);
              if (!isNaN(parsedX)) {
                x = parsedX;
              }
            }
            
            if (yParam) {
              const parsedY = parseFloat(yParam);
              if (!isNaN(parsedY)) {
                y = parsedY;
              }
            }
          }
          
          // Validate that both x and y are provided
          if (x === undefined || y === undefined) {
            return {
              content: JSON.stringify({ error: 'Both x and y coordinates are required' }, null, 2),
              mimeType: 'application/json'
            };
          }
          
          // Execute elementsFromPoint command
          const elementsData = await mcpHandler.executeCommand('elementsFromPoint', {
            tabId,
            x,
            y
          });
          
          // Return the elements data as JSON
          return {
            content: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              coordinates: { x, y },
              elements: elementsData
            }, null, 2),
            mimeType: 'application/json'
          };
        } catch (error) {
          logger.error(`Failed to get elements from point for tab ${tabId}:`, error);
          return null;
        }
      }
    }
    
    // Check if it's a DOM resource (e.g., "tab/123/dom")
    const domMatch = resourcePath.match(/^tab\/(.+)\/dom$/);
    if (domMatch) {
      const tabId = domMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        try {
          // Parse query parameters for selector
          let selector: string | undefined;
          
          if (queryString) {
            const params = new URLSearchParams(queryString);
            selector = params.get('selector') || undefined;
          }
          
          // Execute DOM command
          const domData = await mcpHandler.executeCommand('dom', {
            tabId,
            selector
          });
          
          // Return the DOM data as JSON
          return {
            content: JSON.stringify({
              tabId: tabId,
              url: tab.url,
              title: tab.title,
              selector: selector || 'body',
              dom: domData
            }, null, 2),
            mimeType: 'application/json'
          };
        } catch (error) {
          logger.error(`Failed to get DOM for tab ${tabId}:`, error);
          return null;
        }
      }
    }
    
    // Check if it's a tab-specific resource (e.g., "tab/123")
    const tabMatch = resourcePath.match(/^tab\/(.+)$/);
    if (tabMatch) {
      const tabId = tabMatch[1];
      const tab = tabRegistry.get(tabId);
      
      if (tab) {
        // Return detailed information about the specific tab
        const tabInfo = {
          tabId: tab.tabId,
          url: tab.url,
          title: tab.title,
          connectedAt: tab.connectedAt,
          lastPing: tab.lastPing,
          domSize: tab.domSize,
          fullPageDimensions: tab.fullPageDimensions,
          viewportDimensions: tab.viewportDimensions,
          scrollPosition: tab.scrollPosition,
          pageVisibility: tab.pageVisibility,
          pageLoadTimes: tab.pageLoadTimes
        };
        
        return {
          content: JSON.stringify(tabInfo, null, 2),
          mimeType: 'application/json'
        };
      }
    }
  } catch (error) {
    logger.error('Error reading resource:', error);
  }
  
  return null;
};

// Start the MCP server with stdio transport
async function startServer() {
  try {
    // Reset client initialization state
    clientInitialized = false;
    
    const transport = new StdioServerTransport();
    
    // Add disconnect detection for stdin
    // The StdioServerTransport doesn't detect when stdin is closed by the MCP client
    // We need to add our own listeners for the 'end' and 'close' events
    process.stdin.on('end', () => {
      logger.log('stdin ended - MCP client disconnected');
      // Trigger the transport's onclose callback if it exists
      if (transport.onclose) {
        transport.onclose();
      }
    });
    
    process.stdin.on('close', () => {
      logger.log('stdin closed - MCP client disconnected');
      // Trigger the transport's onclose callback if it exists
      if (transport.onclose) {
        transport.onclose();
      }
    });
    
    // Set up server disconnect handler
    server.onclose = () => {
      logger.log('MCP server connection closed - cleaning up and exiting');
      
      // Clean up all resources
      mcpHandler.cleanup();
      wsManager.shutdown();
      
      // Close HTTP server
      httpServer.close(() => {
        logger.log('HTTP server closed');
        process.exit(0);
      });
      
      // Force exit after 5 seconds if graceful shutdown fails
      setTimeout(() => {
        logger.error('Graceful shutdown timeout - forcing exit');
        process.exit(0);
      }, 5000);
    };
    
    await server.connect(transport);
    logger.log('MCP server started');
    logger.log(`HTTP endpoints available at http://localhost:${PORT}/`);
    logger.log(`Resource endpoints: http://localhost:${PORT}/tabs`);
    logger.log(`Dynamic tab endpoints: http://localhost:${PORT}/tab/{tabId}`);
    logger.log(`Console log endpoints: http://localhost:${PORT}/tab/{tabId}/console`);
    logger.log(`Screenshot endpoints: http://localhost:${PORT}/tab/{tabId}/screenshot`);
    logger.log(`Screenshot view endpoints: http://localhost:${PORT}/tab/{tabId}/screenshot/view`);
    logger.log(`Elements at point endpoints: http://localhost:${PORT}/tab/{tabId}/elementsFromPoint?x={x}&y={y}`);
    logger.log(`DOM endpoints: http://localhost:${PORT}/tab/{tabId}/dom`);
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
