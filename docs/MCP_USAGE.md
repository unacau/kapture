# Using Kapture with MCP Clients

This guide explains how to use Kapture with Model Context Protocol (MCP) clients like Claude Desktop, Cline, or custom MCP implementations.

## 🚀 Multiple AI Assistants Support

**Kapture's standout feature**: Run multiple AI assistants simultaneously! Multiple AI clients can connect to the same server and control different browser tabs independently. This enables powerful workflows like:
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

Kapture excels at supporting multiple AI clients at the same time. The first client connects via stdio (when using Claude Desktop), while additional clients connect via WebSocket:

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
      "args": ["kapture-mcp-server"]
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

### Important Note on CSS Selectors

**Selector Behavior**: All tools that accept a CSS `selector` parameter will only operate on the **first element** that matches the selector. This applies to:
- `click`, `hover`, `fill`, `select` - Interaction tools
- `screenshot`, `dom` - Capture tools

**Unique Selectors**: To ensure consistent targeting, these tools automatically:
1. Find the first matching element
2. Generate a unique ID for the element if it doesn't already have one (in the format `kapture-{number}`)
3. Return the unique selector in the response, which includes this ID

This means:
- If you use `.button` and there are multiple buttons, only the first one will be clicked
- The response will include a selector like `#kapture-123` that uniquely identifies the exact element that was used
- Subsequent operations can use this unique selector to target the same element precisely

**For Multiple Elements**: Use the `elements` tool to get information about all matching elements first, then use their unique selectors for individual operations. You can filter by visibility using the `visible` parameter (true = only visible, false = only hidden, all = all elements).

### XPath Support

All tools that accept a CSS `selector` parameter also support XPath expressions through the `xpath` parameter. This provides more powerful element selection capabilities:

**When to Use XPath:**
- Finding elements by text content: `//button[contains(text(), 'Submit')]`
- Complex parent-child relationships: `//form[@id='login']//input[@type='password']`
- Following/preceding siblings: `//label[text()='Email']/following-sibling::input`
- When CSS selectors can't express the relationship you need

**Important Notes:**
- Use either `selector` OR `xpath`, not both
- If both are provided, `selector` takes precedence
- XPath expressions must be valid - invalid expressions will return an error
- The :contains() pseudo-selector is NOT valid CSS - use XPath instead

**Example - Click button with specific text:**
```javascript
// Using XPath to click a button containing specific text
await client.callTool('kapturemcp_click', {
  tabId: 'tab-123',
  xpath: "//button[contains(text(), 'Submit Form')]"
});

// Fill input field that follows a specific label
await client.callTool('kapturemcp_fill', {
  tabId: 'tab-123',
  xpath: "//label[text()='Email Address']/following-sibling::input",
  value: 'user@example.com'
});
```

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
- `selector` (string, optional): CSS selector to capture (only the first matching element will be captured)
- `width` (number, optional): Viewport width
- `height` (number, optional): Viewport height

**Returns:** Base64 encoded image data. When a selector is used, the response includes the unique selector of the captured element (may include auto-generated ID).

### kapturemcp_click
Click on a page element.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `selector` (string, required): CSS selector of element to click (only the first matching element will be clicked)

**Returns:** Object with:
- `clicked` (boolean): Whether the click was successful
- `selector` (string): The unique selector of the element that was clicked (may include auto-generated ID)

**Performance Note:** This tool may experience delays when the Kapture DevTools panel is not the active tab. For best performance, keep the Kapture panel selected in Chrome DevTools.

### kapturemcp_hover
Hover over a page element.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `selector` (string, required): CSS selector of element to hover (only the first matching element will be hovered)

**Returns:** Object with:
- `hovered` (boolean): Whether the hover was successful
- `selector` (string): The unique selector of the element that was hovered (may include auto-generated ID)

**Performance Note:** This tool may experience delays when the Kapture DevTools panel is not the active tab. For best performance, keep the Kapture panel selected in Chrome DevTools.

### kapturemcp_fill
Fill an input field with text.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `selector` (string, required): CSS selector of input field (only the first matching element will be filled)
- `value` (string, required): Text to fill

**Returns:** Object with:
- `filled` (boolean): Whether the fill was successful
- `selector` (string): The unique selector of the element that was filled (may include auto-generated ID)
- `value` (string): The value that was filled

### kapturemcp_select
Select an option from an HTML `<select>` dropdown element.

**Parameters:**
- `tabId` (string, required): Target tab ID
- `selector` (string, required): CSS selector of HTML `<select>` element (only the first matching element will be used)
- `value` (string, required): Value attribute of the option to select

**Returns:** Object with:
- `selected` (boolean): Whether the selection was successful
- `selector` (string): The unique selector of the select element that was used (may include auto-generated ID)
- `value` (string): The value that was selected
- `selectedText` (string): The text of the selected option
- `options` (array): All available options in the select element

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
- `selector` (string, optional): CSS selector of element (defaults to body, only the first matching element will be used)

**Returns:** Object with:
- `found` (boolean): Whether element was found
- `html` (string): The outerHTML content (if found)
- `selector` (string): The unique selector of the element (may include auto-generated ID when a selector was provided)
- `error` (object): Error details if element not found

## MCP Resources

In addition to tools, Kapture provides MCP resources for accessing data:

### kapturemcp://tabs
List all connected browser tabs.

**Returns:** JSON array of all connected tabs with their information

### kapture://tab/{tabId}
Get detailed information about a specific tab.

**Parameters:**
- `tabId` (in URL path): The tab ID

**Returns:** JSON object with tab details including URL, title, dimensions, scroll position, etc.

### kapture://tab/{tabId}/console
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

### kapture://tab/{tabId}/screenshot
Capture a screenshot of a specific tab or element.

**Parameters:**
- `tabId` (in URL path): The tab ID
- `selector` (query param, optional): CSS selector of element to capture (only the first matching element will be captured)
- `scale` (query param, optional): Scale factor (0.1-1.0) to reduce screenshot size (default: 0.3)
- `format` (query param, optional): Image format - webp, jpeg, or png (default: webp)
- `quality` (query param, optional): Compression quality for webp/jpeg (0.1-1.0, default: 0.85)

**Returns:** JSON object with:
- `tabId` (string): The tab ID
- `url` (string): Current URL of the tab
- `title` (string): Current title of the tab
- `parameters` (object): The parameters used for the screenshot
- `screenshot` (object): Screenshot data including:
  - `dataUrl` (string): Base64 encoded data URL of the image
  - `scale` (number): The scale factor applied
  - `format` (string): The image format used
  - `quality` (number): The compression quality used
  - `name` (string): Name of the screenshot

**Examples:**
- `kapturemcp://tab/abc123/screenshot` - Full page screenshot with defaults
- `kapturemcp://tab/abc123/screenshot?selector=.main-content` - Capture specific element
- `kapturemcp://tab/abc123/screenshot?scale=0.5&format=jpeg&quality=0.9` - Higher quality JPEG
- `kapturemcp://tab/abc123/screenshot?selector=%23header&format=png` - PNG of element with ID "header"

**Note:** This resource provides the same functionality as the `kapturemcp_screenshot` tool but as a resource for better integration with MCP clients.

### kapture://tab/{tabId}/elementsFromPoint
Get information about all elements at a specific coordinate in the viewport.

**Parameters:**
- `tabId` (in URL path): The tab ID
- `x` (query param, required): X coordinate relative to the viewport
- `y` (query param, required): Y coordinate relative to the viewport

**Returns:** JSON object with:
- `tabId` (string): The tab ID
- `url` (string): Current URL of the tab
- `title` (string): Current title of the tab
- `coordinates` (object): The x and y coordinates queried
- `elements` (array): Array of elements at the specified point, ordered from top to bottom, each containing:
  - `index` (number): Order in the stack (0 is topmost)
  - `tagName` (string): HTML tag name
  - `id` (string|null): Element ID if present
  - `className` (string|null): Element className attribute
  - `classList` (array): Array of individual class names
  - `selector` (string): Unique CSS selector for the element
  - `text` (string): Text content (truncated to 100 chars)
  - `href` (string|null): Link URL for anchor elements
  - `src` (string|null): Source URL for images/media
  - `alt` (string|null): Alt text for images
  - `value` (string|null): Form element value
  - `type` (string|null): Input/button type
  - `name` (string|null): Form element name
  - `role` (string|null): ARIA role
  - `ariaLabel` (string|null): ARIA label
  - `dataAttributes` (object): All data-* attributes
  - `bounds` (object): Element position and dimensions
  - `style` (object): Key computed styles (display, visibility, opacity, etc.)
  - `isVisible` (boolean): Whether the element is visible
  - `scrollParent` (string|null): Unique selector of the nearest scrollable parent element, if any

**Examples:**
- `kapturemcp://tab/abc123/elementsFromPoint?x=100&y=200` - Get all elements at viewport coordinates (100, 200)
- `kapturemcp://tab/abc123/elementsFromPoint?x=500.5&y=300.25` - Supports decimal coordinates

**Note:** This uses the browser's `document.elementsFromPoint()` API to get all elements at the specified coordinates, from topmost to bottommost in the stacking order.

### kapture://tab/{tabId}/dom
Get the DOM HTML of a specific tab or element.

**Parameters:**
- `tabId` (in URL path): The tab ID
- `selector` (query param, optional): CSS selector of element to get HTML from (defaults to body, only the first matching element will be used)

**Returns:** JSON object with:
- `tabId` (string): The tab ID
- `url` (string): Current URL of the tab
- `title` (string): Current title of the tab
- `selector` (string): The CSS selector used (or 'body' if none provided)
- `dom` (object): DOM data containing:
  - `found` (boolean): Whether the element was found
  - `html` (string): The outerHTML of the element
  - `error` (object|undefined): Error details if element not found

**Examples:**
- `kapturemcp://tab/abc123/dom` - Get full body HTML
- `kapturemcp://tab/abc123/dom?selector=.main-content` - Get HTML of element with class "main-content"
- `kapturemcp://tab/abc123/dom?selector=%23header` - Get HTML of element with ID "header"

**Note:** This resource provides the same functionality as the `kapturemcp_dom` tool but as a resource for better integration with MCP clients.

## MCP Notifications

Kapture sends real-time notifications for various events:

### kapture/tabs_changed
Sent when tabs connect, disconnect, or update their information.

**Payload:**
```json
{
  "tabs": [/* array of tab objects */],
  "timestamp": 1234567890
}
```

### kapture/tab_disconnected
Sent when a specific tab disconnects.

**Payload:**
```json
{
  "tabId": "tab-123",
  "timestamp": 1234567890
}
```

### kapture/console_log
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
  if (notification.method === 'kapture/console_log') {
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

## HTTP Endpoints

In addition to MCP resources, Kapture provides direct HTTP endpoints for accessing data and images. These are useful for debugging, testing, or integration with non-MCP tools.

### Discovery Endpoint
**GET http://localhost:{port}/**

Returns server status and MCP client information.

**Response:**
```json
{
  "mcpClient": {
    "name": "Claude Desktop",
    "version": "0.7.2"
  }
}
```

### Tab List
**GET http://localhost:{port}/tabs**

Returns a JSON array of all connected tabs.

**Response:**
```json
[
  {
    "tabId": "1",
    "url": "https://example.com",
    "title": "Example Domain",
    "connectedAt": 1234567890,
    "lastPing": 1234567900
  }
]
```

### Tab Information
**GET http://localhost:{port}/tab/{tabId}**

Returns detailed information about a specific tab.

**Response:**
```json
{
  "tabId": "1",
  "url": "https://example.com",
  "title": "Example Domain",
  "connectedAt": 1234567890,
  "lastPing": 1234567900,
  "domSize": 12345,
  "fullPageDimensions": {"width": 1200, "height": 2400},
  "viewportDimensions": {"width": 1200, "height": 800},
  "scrollPosition": {"x": 0, "y": 0},
  "pageVisibility": {"visible": true, "visibilityState": "visible"}
}
```

### Console Logs
**GET http://localhost:{port}/tab/{tabId}/console**

Returns console logs from a specific tab.

**Query Parameters:**
- `before`: ISO timestamp to get logs before
- `limit`: Maximum number of logs (default: 100)
- `level`: Filter by log level (log, info, warn, error)

**Example:** `http://localhost:61822/tab/1/console?level=error&limit=50`

### Screenshot (JSON)
**GET http://localhost:{port}/tab/{tabId}/screenshot**

Returns screenshot data as JSON with base64 encoded image.

**Query Parameters:**
- `selector`: CSS selector of element to capture
- `scale`: Scale factor (0.1-1.0, default: 0.3)
- `format`: Image format - webp, jpeg, or png (default: webp)
- `quality`: Compression quality (0.1-1.0, default: 0.85)

**Response:**
```json
{
  "tabId": "1",
  "url": "https://example.com",
  "title": "Example Domain",
  "parameters": {
    "selector": null,
    "scale": 0.3,
    "format": "webp",
    "quality": 0.85
  },
  "screenshot": {
    "dataUrl": "data:image/webp;base64,..."
    /* other screenshot data */
  }
}
```

### Screenshot (Direct Image)
**GET http://localhost:{port}/tab/{tabId}/screenshot/view**

Returns the screenshot as a direct image response (not JSON).

**Query Parameters:** Same as the JSON endpoint above.

**Response:** Binary image data with appropriate Content-Type header.

**Examples:**
- `http://localhost:61822/tab/1/screenshot/view` - Full page screenshot
- `http://localhost:61822/tab/1/screenshot/view?selector=.header&format=png` - PNG of header
- `http://localhost:61822/tab/1/screenshot/view?scale=1&quality=0.95` - High quality screenshot

This endpoint is particularly useful for:
- Viewing screenshots directly in a browser
- Embedding in HTML: `<img src="http://localhost:61822/tab/1/screenshot/view">`
- Downloading screenshots with tools like curl or wget
- Integration with image processing tools

### Elements at Point
**GET http://localhost:{port}/tab/{tabId}/elementsFromPoint**

Get information about all elements at a specific coordinate in the viewport.

**Query Parameters:**
- `x` (required): X coordinate relative to the viewport
- `y` (required): Y coordinate relative to the viewport

**Response:** JSON object with element information (same as the MCP resource).

**Examples:**
- `http://localhost:61822/tab/1/elementsFromPoint?x=100&y=200` - Get elements at (100, 200)
- `http://localhost:61822/tab/1/elementsFromPoint?x=500.5&y=300.25` - Decimal coordinates

This endpoint is useful for:
- Debugging element stacking and layout issues
- Finding clickable elements at specific coordinates
- Analyzing page structure at mouse positions
- Building custom interaction tools

### DOM
**GET http://localhost:{port}/tab/{tabId}/dom**

Get the DOM HTML of a specific tab or element.

**Query Parameters:**
- `selector` (optional): CSS selector of element to get HTML from (defaults to body)

**Response:** JSON object with:
- `tabId` (string): The tab ID
- `url` (string): Current URL of the tab
- `title` (string): Current title of the tab
- `selector` (string): The CSS selector used (or 'body' if none provided)
- `dom` (object): DOM data containing:
  - `found` (boolean): Whether the element was found
  - `html` (string): The outerHTML of the element
  - `error` (object|undefined): Error details if element not found

**Examples:**
- `http://localhost:61822/tab/1/dom` - Get full body HTML
- `http://localhost:61822/tab/1/dom?selector=.main-content` - Get HTML of element with class "main-content"
- `http://localhost:61822/tab/1/dom?selector=%23header` - Get HTML of element with ID "header" (URL encoded)

This endpoint is particularly useful for:
- Extracting specific page sections for analysis
- Monitoring DOM changes during automation
- Debugging element structure
- Content scraping and extraction

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
