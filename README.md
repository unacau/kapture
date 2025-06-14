# Kapture - Chrome DevTools Extension for Browser Automation

Kapture is a Chrome DevTools Extension that provides remote browser automation capabilities through the Model Context Protocol (MCP). It allows external applications to control browser tabs through JSON-based commands over WebSocket connections.

## Current Status: Phase 6 Complete ✅

### Phase 1 - Basic Foundation ✅
- Chrome Extension with DevTools panel
- MCP Server with WebSocket support
- Tab registration and connection management
- Basic UI for connection status

### Phase 2 - Core Commands ✅
- Command executor and queue management
- Navigate to URL (`kapturemcp_navigate`)
- Browser navigation (`kapturemcp_go_back`, `kapturemcp_go_forward`)
- Screenshot capture (`kapturemcp_screenshot`)
- Element interaction (`kapturemcp_click`)
- Console log collection (`kapturemcp_logs`)
- Command timeout handling
- Test HTTP endpoint for command testing

### Phase 3 - DevTools Testing Features ✅
- Manual command testing interface
- Response visualization
- Console log viewer
- Command history

### Phase 4 - MCP Protocol Integration ✅
- Full MCP server with stdio transport
- 11 browser automation tools
- Tab discovery and management
- Error propagation

### Phase 5 - Test Application ✅
- Electron-based MCP client using real stdio protocol
- Exactly mimics Claude Desktop's connection method
- Tool discovery and testing interface
- Real-time tab management

### Phase 6 - Advanced Commands ✅
- Fill input fields (`kapturemcp_fill`)
- Select dropdown options (`kapturemcp_select`)
- Hover over elements (`kapturemcp_hover`)
- Execute JavaScript (`kapturemcp_evaluate`)

### Phase 8 - UI Enhancement ✅
- Modern visual design with CSS variables
- Toast notification system for feedback
- Visual command execution progress bar
- Enhanced connection status animations
- Ripple effects on buttons
- Dark theme support with toggle
- Tab badges for notifications
- Smooth transitions and animations

## Project Structure

```
kapture/
├── extension/          # Chrome Extension
├── server/            # MCP Server (Node.js/TypeScript)
├── test-app/          # Electron Test Application (MCP client)
└── docs/              # Documentation
```

## Setup Instructions

### 1. Install and Build the MCP Server

```bash
cd server
npm install
npm run build
```

### 2. Load the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension` folder from this project

### 3. Start the MCP Server

```bash
cd server
npm start
```

You should see:
```
Kapture MCP Server starting...
WebSocket server listening on ws://localhost:61822
Test HTTP endpoint listening on http://localhost:8080
Available endpoints:
  GET  http://localhost:8080/tabs - List connected tabs
  POST http://localhost:8080/command - Send command to tab
MCP Server ready for connections
```

### 4. Test the Connection

1. Open any website in Chrome
2. Open Chrome DevTools (F12)
3. Navigate to the "Kapture" panel
4. Click "Connect"

You should see:
- Status indicator turns green
- "Connected to server" message in the log
- Tab registration confirmation

### 5. Test Phase 2 Commands

Open `test-phase2.html` in any browser to test the commands:

```bash
# Open the test page
open test-phase2.html
# Or navigate to file:///path/to/kapture/test-phase2.html
```

The test page provides:
- Live tab listing with auto-refresh
- Quick test buttons for each command
- Manual command tester with JSON parameter editing
- Response visualization

### 6. Disconnect

Click "Disconnect" in the Kapture panel to close the connection.

## Development

### Server Development

To run the server in development mode with auto-reload:

```bash
cd server
npm run dev
```

### Extension Development

After making changes to the extension:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the Kapture extension card

## DevTools Panel Features

### Enhanced UI (Phase 3 & 8)

The Kapture DevTools panel now includes:

1. **Modern Visual Design**
   - Clean, Material Design-inspired interface
   - Consistent color scheme with CSS variables
   - Smooth animations and transitions
   - Custom icons and visual indicators
   - Professional gradient branding

2. **Tabbed Interface**
   - **Connection**: Server connection status and tab information
   - **Testing**: Manual command testing with parameter forms
   - **Console**: Live console output viewer
   - **History**: Command history with replay functionality
   - Tab badges show notification counts

3. **Command Testing Tab**
   - Dropdown to select commands
   - Dynamic parameter forms based on command type
   - Execute button with loading state and ripple effects
   - Response viewer with JSON formatting
   - Screenshot preview for screenshot commands

4. **Console Tab**
   - Real-time console log capture
   - Level-based filtering (log, error, warn, info)
   - Auto-scroll toggle
   - Clear and refresh controls
   - Dark background for better readability

5. **History Tab**
   - Complete command history with visual status indicators
   - Click to replay any command
   - Success/failure status badges
   - Timestamp tracking
   - Hover effects for better interactivity

### UI Enhancements (Phase 8)

1. **Toast Notifications**
   - Success/error/warning/info notifications
   - Auto-dismiss or persistent options
   - Positioned in top-right corner
   - Smooth slide-in animations

2. **Command Progress Indicator**
   - Bottom progress bar during command execution
   - Shimmer effect for visual feedback
   - Automatic show/hide

3. **Dark Theme Support**
   - Toggle between light and dark themes
   - Respects system preferences
   - Smooth theme transitions
   - Persistent theme selection

4. **Visual Feedback**
   - Button ripple effects
   - Connection status animations (pulse, glow)
   - Hover states on all interactive elements
   - Loading states with spinners

5. **Accessibility**
   - Focus-visible outlines
   - Reduced motion support
   - ARIA labels on interactive elements
   - High contrast in both themes

## Using with MCP Clients

Kapture can be used with any MCP-compatible client like Claude Desktop, Cline, or custom implementations.

### Quick Setup for Claude Desktop

1. Add to your Claude Desktop config:
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

2. Start a Chrome tab and connect via Kapture DevTools panel

3. Use the tools in Claude:
```
Can you navigate to example.com and take a screenshot?
Can you click the first link on the page?
```

See [docs/MCP_USAGE.md](docs/MCP_USAGE.md) for detailed setup instructions and examples.

### Available MCP Tools

- `kapturemcp_list_tabs` - List all connected browser tabs
- `kapturemcp_navigate` - Navigate to a URL
- `kapturemcp_go_back` - Browser back button
- `kapturemcp_go_forward` - Browser forward button
- `kapturemcp_screenshot` - Capture screenshots
- `kapturemcp_click` - Click elements
- `kapturemcp_hover` - Hover over elements
- `kapturemcp_fill` - Fill input fields
- `kapturemcp_select` - Select dropdown options
- `kapturemcp_evaluate` - Execute JavaScript
- `kapturemcp_logs` - Retrieve console logs
- `kapturemcp_dom` - Get outerHTML of body or specific element

## Testing Commands

### Using the Test Page

1. Ensure the server is running
2. Connect a Chrome tab via the Kapture DevTools panel
3. Open `test-phase2.html` in any browser
4. Select the connected tab from the list
5. Use the quick test buttons or manual command tester

### Command Examples

**Basic Navigation & Interaction:**
```javascript
// Navigate
{ "url": "https://example.com", "timeout": 30000 }

// Go back/forward
{} // No parameters needed

// Screenshot
{ "name": "my-screenshot" }
{ "name": "element-shot", "selector": ".main-content" }

// Click
{ "selector": "button.submit" }
```

**Form Automation:**
```javascript
// Fill input field
{ "selector": "input[name='email']", "value": "user@example.com" }

// Select dropdown option
{ "selector": "select#country", "value": "US" }
```

**Advanced Interactions:**
```javascript
// Hover over element
{ "selector": ".dropdown-trigger" }

// Execute JavaScript
{ "code": "document.title" }
{ "code": "document.querySelectorAll('a').length" }
{ "code": "window.scrollTo(0, document.body.scrollHeight)" }

// Get console logs
{ "max": 100 }

// Get DOM HTML
{} // Gets entire body
{ "selector": ".main-content" } // Gets specific element
```

## Completed Features

### Phase 1 - Basic Foundation ✅
- Chrome Extension structure
- DevTools panel integration
- WebSocket client/server connection
- Tab registration protocol
- Connection status UI
- Basic error handling

### Phase 2 - Core Commands ✅
- Screenshot capture
- Navigation commands (navigate, back, forward)
- Click interactions
- Console log collection
- Command timeout handling
- Command queue management
- Test HTTP endpoint

### Phase 3 - DevTools Testing Features ✅
- Manual command testing interface with parameter forms
- Response visualization with JSON formatting
- Screenshot preview display
- Console log viewer with filtering
- Command history with replay functionality
- Tabbed interface for better organization
- Enhanced error display and handling

### Phase 4 - MCP Protocol Integration ✅
- Full MCP server implementation with stdio transport
- Tool definitions for all 11 browser automation commands
- Tab discovery with `kapturemcp_list_tabs`
- Advanced tab management with metadata tracking
- Command routing with response handling
- Error propagation from extension to MCP client
- Comprehensive MCP usage documentation

See [specs/PRODUCT_SPEC.md](specs/PRODUCT_SPEC.md) for the complete roadmap.

## Architecture

The system consists of three main components:

1. **Chrome Extension**: Runs in each browser tab, provides DevTools panel
2. **MCP Server**: Bridges MCP clients with Chrome Extension instances
3. **Test Web App**: (Coming in Phase 5) For testing the integration

```
MCP Clients <--MCP--> MCP Server <--WebSocket--> Chrome Extensions
```

## Troubleshooting

### Extension doesn't appear in DevTools
- Make sure the extension is loaded and enabled
- Close and reopen DevTools

### Cannot connect to server
- Verify the server is running (`npm start` in server directory)
- Check that port 61822 is not in use
- Check browser console for error messages

### WebSocket connection fails
- Ensure no firewall is blocking localhost:61822
- Try reloading the extension

## License

MIT
