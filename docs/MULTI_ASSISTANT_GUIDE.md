# Running Multiple AI Assistants with Kapture

Kapture's powerful architecture supports running multiple AI assistants simultaneously, enabling advanced workflows and team collaboration scenarios.

## Why Run Multiple AI Assistants?

### 🚀 Parallel Workflows
- **Research & Development**: Have Claude Desktop research documentation while Cline writes implementation code
- **Testing & Building**: Use one AI to run tests while another builds features
- **Multi-tasking**: Automate different websites or tasks concurrently

### 👥 Team Collaboration
- Multiple developers can use their preferred AI tools simultaneously
- Each team member gets their own dedicated port and browser tabs
- No conflicts or interference between different AI sessions

### 🧪 A/B Testing
- Compare how different AI models approach the same task
- Test automation scripts with one AI while developing with another
- Validate results across multiple AI implementations

## How It Works

Each AI client runs its own Kapture MCP server instance on a different port:

```
Claude Desktop → Port 61822 → Chrome Tab 1
Cline         → Port 61823 → Chrome Tab 2
Custom AI     → Port 61824 → Chrome Tab 3
```

The Kapture Chrome extension automatically discovers all running servers and displays them in a dropdown menu.

## Quick Setup Guide

### 1. Configure Claude Desktop (Port 61822)

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

### 2. Configure Cline/VS Code (Port 61823)

Add to VS Code settings:

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

### 3. Configure Additional AI Clients

For each additional client, increment the port number:

```json
{
  "otherAI.mcpServers": {
    "kapture": {
      "command": "npx",
      "args": ["kapture-mcp-server", "--port", "61824"]
    }
  }
}
```

### 4. Connect Browser Tabs

1. Open Chrome and navigate to different websites in separate tabs
2. Open DevTools (F12) in each tab
3. Go to the "Kapture" panel
4. Select the appropriate server from the dropdown to connect automatically

Each tab will connect to its designated AI assistant's server.

## Advanced Configurations

### Custom Port Ranges

If you need specific port ranges for your organization:

```bash
# Development team
npx kapture-mcp-server --port 62000  # Developer 1
npx kapture-mcp-server --port 62001  # Developer 2

# QA team  
npx kapture-mcp-server --port 63000  # QA Tester 1
npx kapture-mcp-server --port 63001  # QA Tester 2
```

### Docker Deployment

Run multiple isolated instances using Docker:

```yaml
version: '3'
services:
  claude-kapture:
    image: kapture-mcp-server
    ports:
      - "61822:61822"
    environment:
      - PORT=61822
      
  cline-kapture:
    image: kapture-mcp-server
    ports:
      - "61823:61823"
    environment:
      - PORT=61823
```

## Best Practices

### Port Management
- **Default**: 61822 (Claude Desktop)
- **Secondary**: 61823-61832 (Other AI clients)
- **Custom**: 62000+ (Avoid conflicts with other services)

### Organization Tips
1. **Document your port assignments** in a team wiki
2. **Use consistent naming** for different AI instances
3. **Monitor resource usage** when running many instances
4. **Set up scripts** to start/stop multiple servers

### Performance Considerations
- Each server instance uses ~50MB of memory
- WebSocket connections are lightweight
- Chrome DevTools must be open for each connected tab
- No practical limit on concurrent instances

## Real-World Examples

### Example 1: Development Workflow

```bash
# Terminal 1: Claude Desktop for code generation (default port)
# Configured in claude_desktop_config.json

# Terminal 2: Cline for code review and testing
# Configured in VS Code settings with port 61823

# Terminal 3: Custom script for automated testing
npx kapture-mcp-server --port 61824
```

### Example 2: Customer Support Automation

Multiple support agents using different AI assistants to handle customer inquiries:

- Agent 1: Claude Desktop on port 61822 for complex queries
- Agent 2: Cline on port 61823 for technical issues
- Agent 3: Custom chatbot on port 61824 for routine tasks

### Example 3: Web Scraping Pipeline

Parallel data collection from multiple sources:

```javascript
// AI 1: Scrape news sites
const ai1 = connectToKapture(61822);

// AI 2: Scrape social media
const ai2 = connectToKapture(61823);

// AI 3: Scrape e-commerce
const ai3 = connectToKapture(61824);

// Run all scrapers in parallel
await Promise.all([
  ai1.scrapeNews(),
  ai2.scrapeSocial(),
  ai3.scrapeCommerce()
]);
```

## Troubleshooting

### Common Issues

**Q: Server dropdown shows "No servers found"**
- Ensure all MCP servers are running
- Check that ports 61822-61832 are not blocked by firewall
- Refresh the DevTools panel

**Q: "Port already in use" error**
- Another process is using the port
- Check with: `lsof -i :61822` (macOS/Linux)
- Use a different port or stop the conflicting process

**Q: Can't connect multiple tabs**
- Each tab needs its own DevTools panel open
- Ensure you're selecting the correct server from dropdown
- Check that Chrome extension has proper permissions

### Debug Mode

Enable debug logging for all instances:

```bash
KAPTURE_DEBUG=1 npx kapture-mcp-server --port 61822
KAPTURE_DEBUG=1 npx kapture-mcp-server --port 61823
```

## Conclusion

Running multiple AI assistants with Kapture unlocks powerful automation capabilities. Whether you're building complex workflows, enabling team collaboration, or maximizing productivity, Kapture's multi-instance support makes it possible.

Start with two AI assistants and expand as your needs grow. The architecture scales effortlessly to support your most ambitious automation projects.