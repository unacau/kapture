# Kapture Test Web Application

A comprehensive web interface for testing MCP (Model Context Protocol) tools with the Kapture browser automation system.

## Features

- **MCP Client Connection**: Connect to the Kapture MCP server via HTTP endpoints
- **Tab Management**: List, select, and monitor connected browser tabs
- **Tool Testing**: Interactive forms for all 11 browser automation tools
- **Command History**: Track and review executed commands with full details
- **Raw MCP Interface**: Send custom MCP protocol requests for advanced testing
- **Response Visualization**: View tool responses with syntax highlighting and screenshot previews
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Getting Started

### Prerequisites

1. Kapture MCP server running (see `/server` directory)
2. Chrome browser with Kapture extension installed
3. At least one browser tab connected via DevTools panel

### Running the Test Application

1. **Start the MCP Server** (if not already running):
   ```bash
   cd ../server
   npm install
   npm run build
   npm start
   ```

2. **Open the Test Application**:
   ```bash
   # Simple HTTP server (Python 3)
   python -m http.server 8000
   
   # Or Node.js http-server
   npx http-server -p 8000
   
   # Or any other static file server
   ```

3. **Access the application**:
   Open http://localhost:8000 in your browser

4. **Connect a Browser Tab**:
   - Open Chrome and navigate to any website
   - Open DevTools (F12)
   - Go to the "Kapture" panel
   - Click "Connect"

5. **Connect to MCP Server**:
   - In the test app, click "Connect to Server"
   - You should see "Connected" status

## Using the Test Application

### Connection Panel

The left sidebar shows:
- **MCP Connection Status**: Connect/disconnect from the server
- **Connected Tabs**: List of browser tabs available for automation
- **Selected Tab Info**: Details about the currently selected tab

### Tool Testing Tab

Test browser automation tools with interactive forms:

1. **Select a Tool** from the dropdown (11 available tools)
2. **Fill Parameters** as required by the tool
3. **Select a Target Tab** (for tools that require one)
4. **Execute Tool** and view the response

Available tools:
- `kaptivemcp_list_tabs` - List all connected tabs
- `kaptivemcp_navigate` - Navigate to a URL
- `kaptivemcp_go_back` - Go back in history
- `kaptivemcp_go_forward` - Go forward in history
- `kaptivemcp_screenshot` - Capture screenshots
- `kaptivemcp_click` - Click elements
- `kaptivemcp_hover` - Hover over elements
- `kaptivemcp_fill` - Fill input fields
- `kaptivemcp_select` - Select dropdown options
- `kaptivemcp_evaluate` - Execute JavaScript
- `kaptivemcp_logs` - Get console logs

### Command History Tab

View and manage command execution history:
- **Click any history item** to expand and see full details
- **Clear History** to remove all entries
- **Export as JSON** to save history data
- History is automatically saved to browser localStorage

### Raw MCP Tab

For advanced users - send custom MCP protocol requests:
- Choose between `tools/list` and `tools/call` methods
- Enter JSON parameters
- View raw response data

## Architecture

### Components

- **`app.js`** - Main application coordinator
- **`components/mcp-client.js`** - MCP server communication
- **`components/tabs-manager.js`** - Tab listing and selection
- **`components/tool-forms.js`** - Dynamic form generation for tools
- **`components/history-manager.js`** - Command history tracking

### Communication Flow

```
Test App → HTTP/REST → MCP Server → WebSocket → Chrome Extension → Browser Tab
```

The test application communicates with the MCP server via HTTP endpoints (Phase 2 testing interface), which then sends commands to browser tabs via WebSocket connections.

## Troubleshooting

### Connection Issues

**"Connection failed" when clicking Connect**:
- Ensure MCP server is running on port 8080
- Check browser console for errors
- Verify server shows "Test HTTP endpoint listening on http://localhost:8080"

**No tabs appearing**:
- Make sure at least one Chrome tab has the Kapture extension connected
- Check the DevTools Kapture panel shows "Connected" status
- Try refreshing the tabs list

### Tool Execution Issues

**"No tab selected" error**:
- Click on a tab in the Connected Tabs list to select it
- The selected tab will highlight in blue

**Tool execution timeouts**:
- Check if the target tab is still responsive
- Verify CSS selectors are correct
- Try simpler operations first

**Screenshots not working**:
- Ensure the tab is visible (not minimized)
- Try without the `selector` parameter first
- Check browser console for permission errors

### Performance

**Slow response times**:
- Check if the target website is responsive
- Consider increasing timeout parameters
- Monitor browser DevTools for JavaScript errors

## Development

### Adding New Tools

To add support for new MCP tools:

1. **Update `tool-forms.js`**:
   ```javascript
   this.tools['new_tool_name'] = {
     name: 'Display Name',
     description: 'Tool description',
     requiresTab: true, // or false
     parameters: [
       { name: 'param1', type: 'text', required: true, ... }
     ]
   };
   ```

2. **Add execution method in `mcp-client.js`**:
   ```javascript
   async executeNewTool(tabId, param1) {
     return await this.executeCommand(tabId, 'new_tool', { param1 });
   }
   ```

3. **Update the switch statement in `tool-forms.js`**:
   ```javascript
   case 'new_tool_name':
     result = await this.mcpClient.executeNewTool(tabId, params.param1);
     break;
   ```

### Styling Customization

The application uses a modern, responsive design with CSS custom properties. Key areas for customization:

- **Colors**: Modify the color scheme in `style.css`
- **Layout**: Adjust the sidebar width and responsive breakpoints
- **Components**: Each component has dedicated CSS classes

### Testing

Test the application with various scenarios:

1. **Connection States**: Test connect/disconnect cycles
2. **Error Handling**: Try invalid parameters and disconnected states
3. **Tab Management**: Test with multiple tabs, tab navigation
4. **Tool Coverage**: Test each tool with various parameters
5. **Responsive Design**: Test on different screen sizes

## Security Notes

- The test application connects to localhost only
- No sensitive data is transmitted or stored
- Command history is stored locally in browser storage
- Screenshots are displayed as base64 data URLs

## Future Enhancements

Potential improvements for the test application:

- **Real-time Updates**: WebSocket connection for live tab updates
- **Batch Operations**: Execute multiple commands in sequence
- **Command Scripting**: Save and replay command sequences
- **Performance Metrics**: Track execution times and success rates
- **Advanced Debugging**: Integration with browser DevTools
- **Template System**: Pre-defined test scenarios