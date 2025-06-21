# Running Multiple AI Assistants with Kapture

Kapture's powerful architecture supports running multiple AI assistants simultaneously through a single server instance, enabling advanced workflows and team collaboration scenarios.

## Why Run Multiple AI Assistants?

### 🚀 Parallel Workflows
- **Research & Development**: Have Claude Desktop research documentation while Cline writes implementation code
- **Testing & Building**: Use one AI to run tests while another builds features
- **Multi-tasking**: Automate different websites or tasks concurrently

### 👥 Team Collaboration
- Multiple developers can use their preferred AI tools simultaneously
- Each AI gets their own browser tabs
- No conflicts or interference between different AI sessions

### 🧪 A/B Testing
- Compare how different AI models approach the same task
- Test automation scripts with one AI while developing with another
- Validate results across multiple AI implementations

## How It Works

Kapture supports multiple connection methods to a single server instance:

```
Claude Desktop → stdio connection → Kapture Server ← WebSocket ← Additional MCP Clients
                                           ↓
                                    Chrome Extension
                                           ↓
                                    Browser Tabs
```

The first client (typically Claude Desktop) connects via stdio, while additional clients connect via WebSocket on port 61822.

## Quick Setup Guide

### 1. Configure Claude Desktop (Primary Client)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### 2. Configure Additional Clients (WebSocket)

Additional MCP clients can connect to the same server via WebSocket:

**For Cline/VS Code:**
```json
{
  "cline.mcpServers": {
    "kapture": {
      "transport": "websocket",
      "url": "ws://localhost:61822/mcp"
    }
  }
}
```

**For custom clients:**
Connect to `ws://localhost:61822/mcp` using the MCP WebSocket protocol.

### 3. Connect Browser Tabs

1. Open Chrome and navigate to different websites in separate tabs
2. Open DevTools (F12) in each tab
3. Go to the "Kapture" panel
4. The extension will automatically connect to the server

Each tab gets a unique ID and can be controlled independently by any connected AI client.

## Server Management

### Starting the Server

The server is automatically started when Claude Desktop launches. You can also start it manually:

```bash
npx kapture-mcp-server
```

### Monitoring Connections

The server shows connected clients in its logs:
- stdio client (Claude Desktop)
- WebSocket clients count
- Active browser tabs

### Server Status

Check server status by visiting:
```
http://localhost:61822/
```

## Use Cases

### Example 1: Documentation & Implementation

1. Claude Desktop browses documentation sites
2. Cline (via WebSocket) implements code based on Claude's findings
3. Both work in parallel on different browser tabs

### Example 2: Testing Workflow

1. One AI writes test scenarios
2. Another AI executes them in the browser
3. A third AI analyzes results

### Example 3: Multi-Site Management

1. AI #1 manages social media accounts
2. AI #2 handles email and communications
3. AI #3 performs data analysis on dashboards

## Best Practices

### Tab Organization
- Use descriptive tab names
- Group related tabs together
- Keep tabs open for quick access

### Resource Management
- Monitor server resource usage
- Close unused tabs to free memory
- Restart server if performance degrades

### Security
- Run server only on localhost
- Don't expose port 61822 to the internet
- Monitor connected clients regularly

## Troubleshooting

### Connection Issues
1. Ensure server is running
2. Check that port 61822 is not blocked
3. Verify WebSocket URL is correct

### Performance
- Limit concurrent operations
- Use appropriate delays between actions
- Monitor Chrome memory usage

### Debugging
Enable debug logging:
```bash
KAPTURE_DEBUG=1 npx kapture-mcp-server
```

## Advanced Features

### Console Log Monitoring
All connected clients receive real-time console logs from browser tabs.

### Resource Sharing
Resources like screenshots and DOM content are available to all connected clients.

### Synchronized Notifications
Tab changes and events are broadcast to all connected clients.

## Conclusion

Running multiple AI assistants with Kapture unlocks powerful automation capabilities. Whether you're building complex workflows, enabling team collaboration, or maximizing productivity, Kapture's multi-client support makes it possible through a single, efficient server instance.