# Using Kapture with MCP Clients

This guide explains how to use Kapture with Model Context Protocol (MCP) clients like Claude Desktop, Cline, or custom MCP implementations.

## 🚀 Multiple AI Assistants Support

**Kapture's standout feature**: Run multiple AI assistants simultaneously! Each AI client can control different browser tabs independently by using separate ports. This enables powerful workflows like:
- Having Claude Desktop perform web research while Cline writes code
- Running multiple automation tasks in parallel
- Team collaboration with different AI tools
- Testing automation scripts while developing new features

## Prerequisites

1. Chrome browser with Kapture extension installed
2. Kapture MCP server running
3. MCP client (Claude Desktop, Cline, etc.)

## Setup

### 1. Start the Kapture MCP Server

The server is typically started automatically by your MCP client (Claude Desktop, Cline, etc.) when configured properly. 

If you need to run it manually:

**Option 1: Using npx (no installation required)**
```bash
npx kapture-mcp-server
```

**Option 2: From source**
```bash
cd kapture/server
npm install
npm run build
npm start
```

The server will start and display:
```
Kapture MCP Server starting...
WebSocket server listening on ws://localhost:61822
MCP Server ready for connections
Available MCP tools: kapturemcp_navigate, kapturemcp_go_back, ...
```

### 2. Connect Chrome Tab

1. Open Chrome and navigate to any website
2. Open Chrome DevTools (F12)
3. Navigate to the "Kapture" panel
4. Select a server from the dropdown (it will connect automatically)

The tab is now ready to receive commands.

## Running Multiple AI Assistants Simultaneously

Kapture excels at supporting multiple AI clients at the same time. Each client uses a different port to avoid conflicts:

### Example Setup: Claude Desktop + Cline

**1. Claude Desktop** (uses default port 61822):
```json
{
  "mcpServers": {
    "kapture": {
      "command": "npx",
      "args": ["kapture-mcp-server"]
    }
  }
}
```

**2. Cline/VS Code** (uses port 61823):
```json
{
  "cline.mcpServers": {
    "kapture": {
      "command": "npx",
      "args": ["kapture-mcp-server", "--port", "61823"]
    }
  }
}
```

**3. Additional Clients** (increment ports as needed):
- Third client: port 61824
- Fourth client: port 61825
- And so on...

Each AI assistant will:
- Start its own MCP server instance
- Connect to different browser tabs
- Operate independently without interference
- Show up as separate servers in the Kapture DevTools dropdown

### 3. Configure Your MCP Client

#### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

**Using npx (Recommended)**
```json
{
  "mcpServers": {
    "kapture": {
      "command": "npx",
      "args": ["kapture-mcp-server"]
    }
  }
}
```

**Using local installation**
```json
{
  "mcpServers": {
    "kapture": {
      "command": "node",
      "args": ["/path/to/kapture/server/dist/index.js"]
    }
  }
}
```

#### Cline

Add to your VS Code settings:

**Using npx (Recommended)**
```json
{
  "cline.mcpServers": {
    "kapture": {
      "command": "npx",
      "args": ["kapture-mcp-server"]
    }
  }
}
```

**Using local installation**
```json
{
  "cline.mcpServers": {
    "kapture": {
      "command": "node",
      "args": ["/path/to/kapture/server/dist/index.js"]
    }
  }
}
```


#### Custom MCP Client

Connect to the Kapture server via stdio:

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Using npx
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['kapture-mcp-server']
});

// Or using local installation
const transport = new StdioClientTransport({
  command: 'node',
  args: ['/path/to/kapture/server/dist/index.js']
});

const client = new Client({
  name: 'my-mcp-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
```

## Available Tools

### kapturemcp_list_tabs
List all connected browser tabs.

**Parameters:** None

**Example:**
```javascript
const result = await client.callTool('kapturemcp_list_tabs', {});
// Returns: { tabs: [{ tabId, url, title, connectedAt }] }
```

### kapturemcp_navigate
Navigate browser tab to a URL.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `url` (string, required): URL to navigate to
- `timeout` (number, optional): Navigation timeout in ms (default: 30000)

**Example:**
```javascript
await client.callTool('kapturemcp_navigate', {
  tabId: 'tab-123',
  url: 'https://example.com',
  timeout: 30000
});
```

### kapturemcp_go_back
Navigate back in browser history.

**Parameters:**
- `tabId` (string, required): Target tab ID

### kapturemcp_go_forward
Navigate forward in browser history.

**Parameters:**
- `tabId` (string, required): Target tab ID

### kapturemcp_screenshot
Capture a screenshot of the page.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `name` (string, required): Screenshot name
- `selector` (string, optional): CSS selector to capture
- `width` (number, optional): Viewport width
- `height` (number, optional): Viewport height

**Returns:** Base64 encoded image data

### kapturemcp_click
Click on a page element.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `selector` (string, required): CSS selector of element to click

**Performance Note:** This tool may experience delays when the Kapture DevTools panel is not the active tab. For best performance, keep the Kapture panel selected in Chrome DevTools.

### kapturemcp_hover
Hover over a page element.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `selector` (string, required): CSS selector of element to hover

**Performance Note:** This tool may experience delays when the Kapture DevTools panel is not the active tab. For best performance, keep the Kapture panel selected in Chrome DevTools.

### kapturemcp_fill
Fill an input field with text.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `selector` (string, required): CSS selector of input field
- `value` (string, required): Text to fill

### kapturemcp_select
Select an option from an HTML `<select>` dropdown element.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `selector` (string, required): CSS selector of HTML `<select>` element
- `value` (string, required): Value attribute of the option to select

**Important Notes:**
- This tool only works with native HTML `<select>` elements
- It does NOT work with custom dropdown implementations (div-based dropdowns, React/Vue components, etc.)
- If the element is not a `<select>`, the tool will return an error with details about what element type was found
- For custom dropdowns, use `kapturemcp_click` to open the dropdown and click the desired option

### kapturemcp_evaluate
Execute JavaScript in the browser context.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `code` (string, required): JavaScript code to execute

**Returns:** Serialized result of execution

### kapturemcp_dom
Get outerHTML of the body or a specific element.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `selector` (string, optional): CSS selector of element (defaults to body)

**Returns:** Object with:
- `found` (boolean): Whether element was found
- `html` (string): The outerHTML content (if found)
- `selector` (string): The selector used
- `error` (object): Error details if element not found

## MCP Resources

In addition to tools, Kapture provides MCP resources for accessing data:

### kapturemcp://tabs
List all connected browser tabs.

**Returns:** JSON array of all connected tabs with their information

### kapturemcp://tab/{tabId}
Get detailed information about a specific tab.

**Parameters:**
- `tabId` (in URL path): The tab ID

**Returns:** JSON object with tab details including URL, title, dimensions, scroll position, etc.

### kapturemcp://tab/{tabId}/console
Get console logs from a specific tab.

**Parameters:**
- `tabId` (in URL path): The tab ID
- `before` (query param, optional): ISO timestamp to get logs before
- `limit` (query param, optional): Maximum number of logs to return (default: 100)
- `level` (query param, optional): Filter by log level (log, info, warn, error)

**Returns:** JSON object with:
- `logs` (array): Log entries (newest first) with timestamp, level, and message
- `total` (number): Total number of logs available
- `filteredTotal` (number): Number of logs matching the filter criteria
- `nextCursor` (string): Timestamp for pagination
- `level` (string): The level filter applied (if any)

**Examples:** 
- `kapturemcp://tab/abc123/console?limit=50&before=2024-01-01T00:00:00.000Z`
- `kapturemcp://tab/abc123/console?level=error`
- `kapturemcp://tab/abc123/console?level=warn&limit=20`

## MCP Notifications

Kapture sends real-time notifications for various events:

### kapturemcp/tabs_changed
Sent when tabs connect, disconnect, or update their information.

**Payload:**
```json
{
  "tabs": [/* array of tab objects */],
  "timestamp": 1234567890
}
```

### kapturemcp/tab_disconnected
Sent when a specific tab disconnects.

**Payload:**
```json
{
  "tabId": "tab-123",
  "timestamp": 1234567890
}
```

### kapturemcp/console_log
Real-time console log events from browser tabs.

**Payload:**
```json
{
  "tabId": "tab-123",
  "logEntry": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "level": "error",
    "message": "Error message"
  },
  "timestamp": 1234567890
}
```

**Example: Subscribing to Console Logs**
```javascript
// In your MCP client
client.on('notification', (notification) => {
  if (notification.method === 'kapturemcp/console_log') {
    const { tabId, logEntry } = notification.params;
    console.log(`[${logEntry.level}] Tab ${tabId}: ${logEntry.message}`);
  }
});
```

## Usage Examples

### Example 1: Web Scraping

```javascript
// List available tabs
const { tabs } = await client.callTool('kapturemcp_list_tabs', {});
const tabId = tabs[0].tabId;

// Navigate to website
await client.callTool('kapturemcp_navigate', {
  tabId,
  url: 'https://news.ycombinator.com'
});

// Get page title
const result = await client.callTool('kapturemcp_evaluate', {
  tabId,
  code: 'document.title'
});

// Click on first article
await client.callTool('kapturemcp_click', {
  tabId,
  selector: '.titleline a'
});

// Take screenshot
const screenshot = await client.callTool('kapturemcp_screenshot', {
  tabId,
  name: 'article-screenshot'
});

// Get article content HTML
const domResult = await client.callTool('kapturemcp_dom', {
  tabId,
  selector: 'article'
});

if (domResult.found) {
  console.log('Article HTML:', domResult.html);
} else {
  console.log('Article element not found');
}
```

### Example 2: Form Automation

```javascript
// Navigate to form
await client.callTool('kapturemcp_navigate', {
  tabId,
  url: 'https://example.com/contact'
});

// Fill form fields
await client.callTool('kapturemcp_fill', {
  tabId,
  selector: '#name',
  value: 'John Doe'
});

await client.callTool('kapturemcp_fill', {
  tabId,
  selector: '#email',
  value: 'john@example.com'
});

// Select dropdown option
await client.callTool('kapturemcp_select', {
  tabId,
  selector: '#subject',
  value: 'general'
});

// Submit form
await client.callTool('kapturemcp_click', {
  tabId,
  selector: 'button[type="submit"]'
});
```

### Example 3: Debugging with Console Logs

```javascript
// Execute some code that logs
await client.callTool('kapturemcp_evaluate', {
  tabId,
  code: `
    console.log('Starting process...');
    console.error('This is an error');
    console.warn('This is a warning');
  `
});

// Retrieve console logs using MCP resource
const resource = await client.readResource(`kapturemcp://tab/${tabId}/console?limit=50`);
const { logs } = JSON.parse(resource.contents[0].text);

// Process logs
logs.forEach(log => {
  console.log(`[${log.level}] ${log.timestamp}: ${log.message}`);
});
```

### Example 4: Advanced JavaScript Execution

```javascript
// Get page information
const pageInfo = await client.callTool('kapturemcp_evaluate', {
  tabId,
  code: `
    ({
      title: document.title,
      url: window.location.href,
      links: document.querySelectorAll('a').length,
      forms: document.querySelectorAll('form').length,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    })
  `
});

// Scroll to bottom
await client.callTool('kapturemcp_evaluate', {
  tabId,
  code: 'window.scrollTo(0, document.body.scrollHeight)'
});

// Wait for element to appear
await client.callTool('kapturemcp_evaluate', {
  tabId,
  code: `
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.querySelector('.dynamic-content')) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  `
});
```

### Example 5: Complex Form Automation

```javascript
// Hover to reveal dropdown menu
await client.callTool('kapturemcp_hover', {
  tabId,
  selector: '.account-menu'
});

// Wait for menu to appear
await client.callTool('kapturemcp_evaluate', {
  tabId,
  code: 'await new Promise(r => setTimeout(r, 500))'
});

// Click login option
await client.callTool('kapturemcp_click', {
  tabId,
  selector: '.dropdown-item[href="/login"]'
});

// Fill login form
await client.callTool('kapturemcp_fill', {
  tabId,
  selector: '#username',
  value: 'testuser@example.com'
});

await client.callTool('kapturemcp_fill', {
  tabId,
  selector: '#password',
  value: 'securepassword123'
});

// Select remember me option
await client.callTool('kapturemcp_click', {
  tabId,
  selector: 'input[type="checkbox"][name="remember"]'
});

// Submit form
await client.callTool('kapturemcp_click', {
  tabId,
  selector: 'button[type="submit"]'
});
```

## Error Handling

Tools handle errors in two ways:

### 1. Fatal Errors (thrown as exceptions)
These are actual failures that prevent the command from executing:

```javascript
try {
  await client.callTool('kapturemcp_click', {
    tabId: 'invalid-tab',
    selector: 'button'
  });
} catch (error) {
  console.error(error.message);
  // "Tab invalid-tab not found"
}
```

### 2. Graceful Errors (returned in response)
For expected conditions like "element not found", tools return success with error details:

```javascript
// Click on element that may not exist
const result = await client.callTool('kapturemcp_click', {
  tabId,
  selector: '.optional-button'
});

if (result.clicked) {
  console.log('Button was clicked');
} else if (result.error && result.error.code === 'ELEMENT_NOT_FOUND') {
  console.log('Button not found on page');
}

// Get DOM of element that may not exist
const domResult = await client.callTool('kapturemcp_dom', {
  tabId,
  selector: '.dynamic-content'
});

if (domResult.found) {
  console.log('Content HTML:', domResult.html);
} else {
  console.log('Content not loaded yet');
}
```

Common error codes:
- `TAB_NOT_FOUND`: Specified tab ID doesn't exist (thrown)
- `ELEMENT_NOT_FOUND`: CSS selector didn't match any elements (graceful)
- `INVALID_ELEMENT`: Element exists but wrong type (graceful)
- `OPTION_NOT_FOUND`: Select option value not found (graceful)
- `TIMEOUT`: Command exceeded timeout limit (thrown)
- `EXECUTION_ERROR`: JavaScript evaluation failed (thrown)

## Best Practices

1. **Always check tab availability** before sending commands:
   ```javascript
   const { tabs } = await client.callTool('kapturemcp_list_tabs', {});
   if (tabs.length === 0) {
     throw new Error('No tabs connected');
   }
   ```

2. **Use appropriate timeouts** for navigation:
   ```javascript
   await client.callTool('kapturemcp_navigate', {
     tabId,
     url: 'https://slow-site.com',
     timeout: 60000 // 60 seconds for slow sites
   });
   ```

3. **Handle dynamic content** with waits:
   ```javascript
   // Wait for element to appear
   await client.callTool('kapturemcp_evaluate', {
     tabId,
     code: `
       await new Promise((resolve) => {
         const observer = new MutationObserver(() => {
           if (document.querySelector('.dynamic-content')) {
             observer.disconnect();
             resolve();
           }
         });
         observer.observe(document.body, { childList: true, subtree: true });
       });
     `
   });
   ```

4. **Clean up resources** when done:
   - Disconnect tabs when finished
   - Close the MCP server gracefully

## Troubleshooting

### No tabs appearing in list
- Ensure Chrome tab is connected via DevTools Kapture panel
- Check that WebSocket connection shows "Connected" status
- Verify server is running on correct port (61822)

### Commands timing out
- Increase timeout parameter for slow operations
- Check browser console for JavaScript errors
- Ensure tab is still connected

### Screenshots not working
- Verify Chrome extension has proper permissions
- Check that tab is in foreground
- Try capturing without selector parameter first

### Connection refused
- Ensure server is running (`npm start` in server directory)
- Check firewall settings for localhost:61822
- Verify MCP client configuration points to correct path

### "Unexpected token" or "not valid JSON" errors
This typically means the server is outputting non-JSON content to stdout, which breaks the MCP protocol:

- Ensure you're using the built version: `npm run build` before starting
- The server should NOT output any console.log messages when used with MCP clients
- For debugging, use: `KAPTURE_DEBUG=1 node dist/index.js` (but not with MCP clients)
- Or set `KAPTURE_LOG_FILE=/path/to/logfile.log` to log to a file

### Debugging the MCP connection
If you need to debug the server while using it with Claude Desktop:

1. Create a separate debug script
2. Use environment variables to enable logging to stderr or a file
3. Never use `console.log` in MCP mode as it interferes with the protocol
