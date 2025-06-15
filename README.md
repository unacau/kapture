# Kapture - Browser Automation via Chrome DevTools

Kapture is a Chrome DevTools Extension that enables browser automation through the Model Context Protocol (MCP). It allows AI applications like Claude to control web browsers via a three-layer architecture.

![Kapture DevTools Extension Panel](extension/ScreenshotWithExtensionPanel.webp)

## Overview

Kapture bridges AI assistants with web browsers through:
- **MCP Server**: Handles MCP protocol communication
- **Chrome Extension**: DevTools panel for browser automation
- **WebSocket Bridge**: Real-time communication between server and extensions

## Architecture
![How Kapture Works](docs/assets/images/HowKaptureWorks.webp)

## Quick Start

### 1. Install Dependencies

```bash
# Server
cd server
npm install
npm run build

# Test App (optional)
cd test-app
npm install
```

### 2. Load Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension` folder

### 3. Start MCP Server
[Configure your AI client](docs/MCP_USAGE.html) and open it. It will start the MCP server automatically.

**OR**

Run the Test App:

```bash
cd test-app
npm run dev
```

The server starts on port 61822 by default. You can specify a custom port:

```bash
# Server
cd server
npm start -- --port 61823

# Test App
cd test-app
npm start -- --port 61823
```

### 4. Connect via DevTools

1. Open any website in Chrome
2. Open Chrome/Brave Developer Tools
3. Navigate to "Kapture" panel
4. The extension will automatically discover available servers (ports 61822-61832)
5. Select a server from the dropdown (or leave default)
6. Click "Connect"

## Using with Claude Desktop

Add to your Claude Desktop config:

### Option 1: Using npx (Recommended - No installation required)
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

### Option 2: Local installation
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

### Running Multiple Instances

If you're using multiple AI clients (e.g., Claude Desktop and Cline), each should use a different port:

**Claude Desktop** (using default port 61822):
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

**Cline/VS Code** (using port 61823):
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

This allows multiple AI clients to control different browser tabs simultaneously without conflict.

Then ask Claude to interact with web pages:
- "Navigate to example.com and take a screenshot"
- "Click the search button"
- "Fill in the email field with test@example.com"

## Available MCP Tools

- `kapturemcp_list_tabs` - List connected browser tabs
- `kapturemcp_navigate` - Navigate to URL
- `kapturemcp_go_back` - Browser back button
- `kapturemcp_go_forward` - Browser forward button
- `kapturemcp_screenshot` - Capture screenshots
- `kapturemcp_click` - Click elements
- `kapturemcp_hover` - Hover over elements
- `kapturemcp_fill` - Fill input fields
- `kapturemcp_select` - Select dropdown options
- `kapturemcp_evaluate` - Execute JavaScript
- `kapturemcp_logs` - Retrieve console logs
- `kapturemcp_dom` - Get HTML content

## Development

### Server Development

```bash
cd server
npm run dev    # Development with hot-reload
npm run debug  # With debug logging (KAPTURE_DEBUG=1)
```

### Test App

```bash
cd test-app
npm run dev    # Run Electron test app
```

### Extension Development

After making changes:
1. Go to `chrome://extensions/`
2. Click refresh on Kapture extension


### Key Components

**Server** (`/server`):
- `mcp-handler.ts` - MCP protocol implementation
- `websocket-manager.ts` - WebSocket server
- `tab-registry.ts` - Tab tracking
- `tools/*.ts` - MCP tool implementations

**Extension** (`/extension`):
- `panel/command-executor.js` - Command execution
- `panel/command-queue.js` - Sequential execution
- `background.js` - Screenshot service worker

## DevTools Panel Features

- **Server Discovery** - Automatically finds available servers on ports 61822-61832
- **Server Selection** - Dropdown to choose between multiple running servers
- **Connection Status** - Real-time server connection indicator
- **Tab Info** - Current tab ID and URL display
- **Command Testing** - Manual command execution interface
- **Console Viewer** - Live console log capture
- **History** - Command history
- **Dark Theme** - Toggle between light/dark modes

## Troubleshooting

### Connection Issues
- The extension will automatically scan for servers on ports 61822-61832
- If no servers are found, verify the server is running
- Check the server dropdown to see which servers were discovered
- Check browser console for errors
- Enable MCP Server debug logging: `KAPTURE_DEBUG=1 npm start`

### Extension Not Showing
- Ensure extension is loaded and enabled
- Close and reopen DevTools
- Reload extension in `chrome://extensions/`

### Command Timeouts
- Default timeout is 5 seconds
- Some commands accept custom timeout parameter
- Check element selectors are correct

## Security

- Commands execute within Chrome's DevTools sandbox
- Each tab has unique ID preventing cross-tab interference
- No direct file system access from extension
- Tab registry enforces command isolation

## License

MIT
