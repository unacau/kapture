# Kapture MCP Test Client

This is an Electron-based test application that connects to the Kapture MCP server using the exact same protocol as Claude Desktop - stdio communication with JSON-RPC messages.

## Features

- **Real MCP Protocol**: Communicates via stdio exactly like Claude Desktop
- **Tool Discovery**: Lists all available MCP tools with their parameters
- **Tab Management**: Shows connected Chrome tabs in real-time
- **Tool Execution**: Execute any MCP tool with proper parameter handling
- **Response Display**: Shows tool responses with JSON formatting
- **Console Output**: Displays all operations and errors

## Setup

1. Install dependencies:
```bash
cd test-app
npm install
```

2. Make sure the Kapture server is built:
```bash
cd ../server
npm run build
```

3. Start the test app:
```bash
cd ../test-app
npm start
```

## Usage

1. **Connect**: Click "Connect" to spawn the MCP server process
2. **Open Chrome**: Open Chrome with the Kapture extension and connect a tab via DevTools
3. **Discover Tools**: The app automatically discovers available tools on connection
4. **Select Tab**: Choose a connected tab from the sidebar
5. **Execute Tools**: Select a tool, fill in parameters, and click Execute

## Architecture

This app demonstrates the proper MCP client implementation:

- **Main Process** (`main.js`): Spawns the MCP server process and handles stdio communication
- **Preload Script** (`preload.js`): Safely exposes MCP functionality to the renderer
- **Renderer Process** (`renderer.js`): Handles the UI and user interactions

## Key Differences from Previous Test App

- Uses real MCP protocol over stdio (not HTTP)
- Spawns the server as a child process (like Claude Desktop)
- Implements proper JSON-RPC message handling
- Shows exactly what Claude Desktop sees

## Development

Run in development mode with DevTools open:
```bash
npm run dev
```