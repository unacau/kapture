# MCP WebSocket Bridge

A bridge application that enables Claude Desktop to connect to WebSocket-based MCP servers by translating between stdio and WebSocket protocols.

## Overview

This bridge acts as a protocol translator:

```mermaid
graph LR
    A[Claude Desktop] <-->|stdio/JSON-RPC| B[Bridge]
    B <-->|WebSocket/JSON-RPC| C[MCP Server]
    
    style A fill:#e1bee7,stroke:#4a148c,stroke-width:2px,color:#000
    style B fill:#c5cae9,stroke:#1a237e,stroke-width:2px,color:#000
    style C fill:#c8e6c9,stroke:#1b5e20,stroke-width:2px,color:#000
```

- **Input**: Accepts MCP messages via stdio from Claude Desktop
- **Output**: Forwards messages over WebSocket to an MCP server

## Installation

```bash
cd bridge
npm install
```

## Usage

### Command Line

```bash
# Basic usage with default settings (connects to ws://localhost:61822/mcp)
node mcp-websocket-bridge.js

# Connect to a specific WebSocket server
node mcp-websocket-bridge.js --url ws://example.com:8080/mcp

# With authentication token
node mcp-websocket-bridge.js --url wss://secure.example.com/mcp --token your-auth-token

# Enable debug logging
node mcp-websocket-bridge.js --debug
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kapture": {
      "command": "node",
      "args": [
        "/path/to/kapture/bridge/mcp-websocket-bridge.js",
        "--url", "ws://localhost:61822/mcp"
      ]
    }
  }
}
```

Or with environment variables:

```json
{
  "mcpServers": {
    "kapture": {
      "command": "node",
      "args": ["/path/to/kapture/bridge/mcp-websocket-bridge.js"],
      "env": {
        "AUTH_TOKEN": "optional-token",
        "DEBUG": "true"
      }
    }
  }
}
```

## Features

```mermaid
graph TD
    A[Bridge Features]
    A --> B[Automatic Reconnection]
    A --> C[Message Queuing]
    A --> D[Heartbeat]
    A --> E[Debug Logging]
    A --> F[Graceful Shutdown]
    
    B --> B1[Exponential Backoff]
    B --> B2[Configurable Intervals]
    
    C --> C1[Queue during disconnect]
    C --> C2[Flush on reconnect]
    
    D --> D1[Periodic ping/pong]
    D --> D2[Connection health check]
    
    E --> E1[stderr output]
    E --> E2[No stdio interference]
    
    style A fill:#b3e5fc,stroke:#01579b,stroke-width:3px,color:#000
    style B fill:#ffccbc,stroke:#bf360c,stroke-width:2px,color:#000
    style C fill:#ffe0b2,stroke:#e65100,stroke-width:2px,color:#000
    style D fill:#c5e1a5,stroke:#33691e,stroke-width:2px,color:#000
    style E fill:#f8bbd0,stroke:#880e4f,stroke-width:2px,color:#000
    style F fill:#d1c4e9,stroke:#4527a0,stroke-width:2px,color:#000
```

- **Automatic Reconnection**: Reconnects with exponential backoff when connection is lost
- **Message Queuing**: Queues messages during disconnection and sends when reconnected
- **Heartbeat**: Maintains connection with periodic ping/pong
- **Debug Logging**: Optional debug output to stderr (doesn't interfere with stdio protocol)
- **Graceful Shutdown**: Properly closes connections on exit

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| --url | -u | WebSocket server URL | ws://localhost:61822/mcp |
| --token | -t | Authentication token | none |
| --debug | -d | Enable debug logging | false |
| --help | -h | Show help message | - |

## Environment Variables

- `AUTH_TOKEN`: Authentication token for server
- `DEBUG`: Set to "true" to enable debug logging

## Architecture

```mermaid
sequenceDiagram
    participant CD as Claude Desktop
    participant B as Bridge
    participant WS as WebSocket Server
    
    CD->>B: JSON-RPC Request (stdin)
    B->>WS: Forward Request (WebSocket)
    WS->>B: JSON-RPC Response
    B->>CD: Forward Response (stdout)
    
    Note over B: Message Queue
    Note over B: Auto-reconnect
    Note over B: Heartbeat/Ping
```

The bridge is transparent and doesn't modify messages - it simply forwards them between the two protocols while handling connection management.

### Message Flow

```mermaid
flowchart TB
    subgraph "Claude Desktop Process"
        CD[Claude Desktop]
    end
    
    subgraph "Bridge Process"
        STDIN[stdin handler]
        QUEUE[Message Queue]
        WSC[WebSocket Client]
        STDOUT[stdout writer]
    end
    
    subgraph "Server Process"
        WSS[WebSocket Server]
    end
    
    CD -->|JSON-RPC| STDIN
    STDIN --> QUEUE
    QUEUE --> WSC
    WSC <-->|WebSocket| WSS
    WSS -->|Response| WSC
    WSC --> STDOUT
    STDOUT -->|JSON-RPC| CD
    
    style CD fill:#e1bee7,stroke:#4a148c,stroke-width:2px,color:#000
    style STDIN fill:#c5cae9,stroke:#1a237e,stroke-width:2px,color:#000
    style QUEUE fill:#fff9c4,stroke:#f57f17,stroke-width:2px,color:#000
    style WSC fill:#c5cae9,stroke:#1a237e,stroke-width:2px,color:#000
    style STDOUT fill:#c5cae9,stroke:#1a237e,stroke-width:2px,color:#000
    style WSS fill:#c8e6c9,stroke:#1b5e20,stroke-width:2px,color:#000
```

## Troubleshooting

1. **Connection Issues**: Enable debug mode to see detailed connection logs
2. **Authentication Errors**: Verify your token is correct and the server accepts it
3. **Message Errors**: Check that both Claude Desktop and the WebSocket server use compatible MCP versions

## Development

To use in development mode with the Kapture server:

1. Start the Kapture server (default port 61822)
2. Configure Claude Desktop to use this bridge
3. The bridge will automatically connect and relay messages