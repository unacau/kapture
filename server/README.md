# Kapture MCP Server

MCP server for Kapture browser automation. This server enables AI assistants like Claude to control web browsers through the Kapture Chrome extension.

**✨ Key Feature**: Support for multiple AI assistants running simultaneously! Run Claude Desktop, Cline, and other MCP clients at the same time using different ports.

## Quick Start

### Run with npx (no installation required)

```bash
npx kapture-mcp-server
```

### Run with custom port

```bash
npx kapture-mcp-server --port 61823
```

### Install globally

```bash
npm install -g kapture-mcp-server
kapture-server
```

### Install locally in a project

```bash
npm install kapture-mcp-server
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration:

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

Or if you installed it globally:

```json
{
  "mcpServers": {
    "kapture": {
      "command": "kapture-server"
    }
  }
}
```

## Command Line Options

- `--port <number>` - Specify WebSocket port (default: 61822)

## Running Multiple AI Assistants

Kapture supports multiple AI clients running simultaneously. Simply run each on a different port:

**Example: Claude Desktop + Cline**

Claude Desktop (claude_desktop_config.json):
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

Cline (VS Code settings.json):
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

Each AI assistant will automatically connect to its designated port and can control different browser tabs independently.

## Requirements

- Node.js 18 or higher
- Chrome browser with Kapture extension installed

## How it Works

1. The MCP server starts and listens on the specified port
2. The Kapture Chrome extension connects to the server via WebSocket
3. AI assistants can now control the browser through MCP tools

## Available MCP Tools

- `navigate` - Navigate to URL
- `back` - Browser back button
- `forward` - Browser forward button
- `click` - Click elements
- `hover` - Hover over elements
- `fill` - Fill input fields
- `select` - Select dropdown options
- `evaluate` - Execute JavaScript
- `querySelectorAll` - Query all elements matching a CSS selector

## MCP Resources

- `kapture://tabs` - List all connected browser tabs
- `kapture://tab/{tabId}` - Get detailed tab information
- `kapture://tab/{tabId}/console` - Get console logs
- `kapture://tab/{tabId}/screenshot` - Capture screenshots
- `kapture://tab/{tabId}/dom` - Get DOM HTML
- `kapture://tab/{tabId}/elementsFromPoint` - Get elements at coordinates
- `kapture://tab/{tabId}/querySelectorAll?selector={selector}` - Query all elements matching a CSS selector

## Documentation

For full documentation and Chrome extension installation, visit:
https://github.com/williamkapke/kapture

## License

MIT