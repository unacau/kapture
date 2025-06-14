# Getting Started with Kapture

This guide will help you get Kapture up and running in just a few minutes.

## Quick Start

### 1. Install the Chrome Extension

1. Download the latest release from [GitHub Releases](https://github.com/williamkapke/kapture/releases)
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `extension` folder

### 2. Clone and Build the Server

```bash
# Clone the repository
git clone https://github.com/williamkapke/kapture.git
cd kapture/server

# Install dependencies
npm install

# Build the server
npm run build

# Start the server
npm start
```

### 3. Connect a Browser Tab

1. Open any website in Chrome
2. Open Chrome DevTools (F12)
3. Navigate to the "Kapture" panel
4. Click "Connect"

You should see a green status indicator and "Connected to server" message.

### 4. Configure Claude Desktop

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "kapture": {
      "command": "node",
      "args": ["/absolute/path/to/kapture/server/dist/index.js"]
    }
  }
}
```

### 5. Test Your Setup

In Claude, try these commands:

- "Can you list the connected browser tabs?"
- "Navigate to example.com and take a screenshot"
- "Click the first link on the page"

## What's Next?

- Read the [full documentation](MCP_USAGE.md) for detailed usage instructions
- Explore all [available tools](MCP_USAGE.md#available-tools)
- Check out [usage examples](MCP_USAGE.md#usage-examples)
- Learn about [best practices](MCP_USAGE.md#best-practices)

## Need Help?

- Check the [troubleshooting guide](MCP_USAGE.md#troubleshooting)
- Visit our [GitHub Issues](https://github.com/williamkapke/kapture/issues)
- Join the discussion on [GitHub Discussions](https://github.com/williamkapke/kapture/discussions)