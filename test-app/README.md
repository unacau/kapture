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

1. **Auto-Connect**: The app automatically starts the MCP server on launch
2. **Open Chrome**: Open Chrome with the Kapture extension and connect a tab via DevTools
3. **Tab List**: Connected tabs appear automatically in the browser-style tab interface
4. **Select Tab**: Click on a tab to see available tools
5. **Execute Tools**: Fill in parameters and click Execute to run tools
6. **View Results**: Results appear below each tool with JSON formatting

Note: The server runs continuously while the app is open. Use Cmd+R to refresh if needed.

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