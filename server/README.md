# Kapture MCP Server

MCP server for Kapture browser automation. This server enables AI assistants like Claude to control web browsers through the Kapture Chrome extension.

**✨ Key Feature**: Support for multiple AI assistants running simultaneously! All clients connect via WebSocket to the same server.

## Quick Start

### Run with npx (no installation required)

```bash
npx kapture-mcp-server
```

The server automatically runs on port 61822.

### Smart Server Detection

When running `npx kapture-mcp-server`, it automatically detects if a server is already running:
- **No existing server**: Starts a new server
- **Server already running**: Shows connection info and exits gracefully

This prevents port conflicts and provides helpful information about existing connections.

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

None - the server always runs on port 61822

## Running Multiple AI Assistants

Kapture supports multiple AI clients through a single server instance:

- **All clients**: Connect via WebSocket to `ws://localhost:61822/mcp`
- All clients share access to the same browser tabs

**Example: Claude Desktop + Cline**

Start the server manually:
```bash
npx kapture-mcp-server
```

Claude Desktop (claude_desktop_config.json):
```json
{
  "mcpServers": {
    "kapture": {
      "transport": "websocket",
      "url": "ws://localhost:61822/mcp"
    }
  }
}
```

Cline (VS Code settings.json) - WebSocket connection:
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

All connected clients can control the same browser tabs simultaneously.

## Requirements

- Node.js 18 or higher
- Chrome browser with Kapture extension installed

## How it Works

1. The MCP server starts and listens on port 61822
2. The Kapture Chrome extension connects to the server via WebSocket
3. AI assistants can now control the browser through MCP tools

## Server Architecture

```mermaid
graph LR
    subgraph "External Clients"
        MCP1["MCP Client 1<br/>Claude Desktop"]
        MCP2["MCP Client 2<br/>Cline"]
        MCPN["MCP Client N<br/>Custom"]
    end
    
    subgraph "Chrome"
        Browser["Chrome Extension<br/>Browser tabs"]
    end
    
    subgraph "Kapture MCP Server [:61822]"
        subgraph "Network Layer"
            HTTP["HTTP Server"]
            WSS["WebSocket Server"]
        end
        
        subgraph "Protocol Layer"
            MCPServer["MCP Server Manager<br/>Handles MCP protocol"]
            BrowserWSMgr["Browser WebSocket Manager<br/>Routes browser messages"]
        end
        
        subgraph "Business Logic"
            CommandHandler["Browser Command Handler<br/>Executes commands"]
            TabReg["Tab Registry<br/>Tracks browser tabs"]
        end
        
        subgraph "HTTP Endpoints"
            Discovery["/"]
            Resources["/tab/{id}/*"]
            Screenshot["/tab/{id}/screenshot/view"]
        end
    end
    
    %% External connections
    MCP1 -.->|WebSocket<br/>:61822/mcp| WSS
    MCP2 -.->|WebSocket<br/>:61822/mcp| WSS
    MCPN -.->|WebSocket<br/>:61822/mcp| WSS
    Browser -.->|WebSocket| WSS
    
    %% Network to Protocol
    HTTP --> Discovery
    HTTP --> Resources
    HTTP --> Screenshot
    WSS --> MCPServer
    WSS --> BrowserWSMgr
    
    %% Protocol to Business Logic
    MCPServer --> CommandHandler
    BrowserWSMgr --> TabReg
    CommandHandler --> TabReg
    
    %% HTTP endpoint connections
    Resources --> MCPServer
    Screenshot --> CommandHandler
    
    %% Styling
    classDef network fill:#e3f2fd,stroke:#1976d2,stroke-width:2px,color:#000
    classDef protocol fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000
    classDef logic fill:#fff3e0,stroke:#f57c00,stroke-width:2px,color:#000
    classDef endpoint fill:#e8f5e9,stroke:#388e3c,stroke-width:2px,color:#000
    classDef external fill:#37474f,stroke:#263238,stroke-width:2px,color:#fff
    
    class HTTP,WSS network
    class MCPServer,BrowserWSMgr protocol
    class CommandHandler,TabReg logic
    class Discovery,Resources,Screenshot endpoint
    class MCP1,MCP2,MCPN,Browser external
```

### Component Responsibilities

- **HTTP Server**: Main entry point, handles HTTP requests and WebSocket upgrades
- **WebSocket Server**: Manages all WebSocket connections (both MCP clients and browser extensions)
- **Tab Registry**: Maintains state of all connected browser tabs
- **MCP Handler**: Executes MCP commands and returns responses
- **Browser WebSocket Manager**: Routes messages between browser extensions and command handlers
- **MCP Server Manager**: Implements MCP protocol for each connected client

## Message Flow Example

Here's how a tool call flows through the system when an MCP client (like Claude) clicks a button on a webpage:

```mermaid
sequenceDiagram
    participant MC as MCP Client<br/>(Claude)
    participant MS as MCP Server<br/>Manager
    participant CH as Browser Command<br/>Handler
    participant BWSM as Browser WebSocket<br/>Manager
    participant CE as Chrome<br/>Extension
    participant WT as Web Page<br/>(Tab)
    
    MC->>MS: tools/call<br/>{"name": "click", "arguments": {"tabId": "123", "selector": "#button"}}
    MS->>CH: click(tabId, selector)
    CH->>BWSM: sendCommand(tabId, command)
    BWSM->>CE: WebSocket message<br/>{"type": "command", "name": "click", "selector": "#button"}
    CE->>WT: Execute command ...
    WT-->>CE: Result(s)
    CE->>BWSM: WebSocket response<br/>{"success": true, ...}
    BWSM->>CH: Command response
    CH->>MS: Result object
    MS->>MC: Tool result<br/>{"success": true, "clicked": "#button"}
    
    Note over MC,WT: The entire flow typically completes in under 100ms
```

This sequence shows:
1. **MCP Protocol Layer**: Client sends JSON-RPC tool call
2. **Command Routing**: Server routes through appropriate handlers
3. **WebSocket Bridge**: Commands cross from MCP to browser extension
4. **DOM Interaction**: Extension executes in browser context
5. **Response Chain**: Results flow back through the same path

### HTTP Request Flow

Here's how an HTTP request works when viewing a screenshot image directly:

```mermaid
sequenceDiagram
    participant BR as Browser/Client
    participant HS as HTTP Server<br/>:61822
    participant RE as Resource<br/>Endpoint Handler
    participant CH as Browser Command<br/>Handler
    participant BWSM as Browser WebSocket<br/>Manager
    participant CE as Chrome<br/>Extension
    
    BR->>HS: GET /tab/123/screenshot/view?scale=0.5&format=png
    HS->>RE: handleResourceEndpoint(path, query)
    RE->>RE: Parse parameters<br/>(scale=0.5, format=png)
    RE->>CH: screenshot(tabId, {scale: 0.5, format: "png"})
    CH->>WM: sendCommand(tabId, screenshot command)
    BWSM->>CE: WebSocket message<br/>(screenshot command)
    CE->>BWSM: WebSocket response<br/>(success + base64 data)
    WM->>CH: Screenshot data
    CH->>RE: Result with base64 data
    RE->>RE: Extract base64 → Buffer
    RE->>HS: Binary image + mimeType
    HS->>BR: HTTP 200<br/>Content-Type: image/png<br/>[Binary image data]
    
    Note over BR,CE: Direct image viewing in browser - no JSON wrapper
```

This shows the key difference from MCP tool calls:
1. **Direct HTTP Access**: Browser/client makes standard HTTP GET request
2. **Resource Routing**: Server identifies this as a special resource endpoint
3. **Image Conversion**: Base64 data is converted to binary for direct viewing
4. **Standard HTTP Response**: Returns actual image, not JSON

## Available MCP Tools

- `navigate` - Navigate to URL
- `back` - Browser back button
- `forward` - Browser forward button
- `click` - Click elements
- `hover` - Hover over elements
- `fill` - Fill input fields
- `select` - Select dropdown options
- `evaluate` - Execute JavaScript
- `elements` - Query all elements matching a CSS selector or XPath with optional visibility filtering

## MCP Resources

- `kapture://tabs` - List all connected browser tabs
- `kapture://tab/{tabId}` - Get detailed tab information
- `kapture://tab/{tabId}/console` - Get console logs
- `kapture://tab/{tabId}/screenshot` - Capture screenshots
- `kapture://tab/{tabId}/dom` - Get DOM HTML
- `kapture://tab/{tabId}/elementsFromPoint` - Get elements at coordinates
- `kapture://tab/{tabId}/elements?selector={selector}&visible={true|false|all}` - Query all elements matching a CSS selector or XPath with optional visibility filtering

## Documentation

For full documentation and Chrome extension installation, visit:
https://github.com/williamkapke/kapture

## License

MIT
