# Kapture DevTools Panel Mockups

This directory contains mockup designs for the simplified Kapture DevTools panel.

## Design Philosophy

The new design follows Chrome DevTools' WebSocket inspector UI pattern:
- Clean, minimal interface focused on message flow
- No unnecessary technical details (WebSocket URLs, etc.)
- Single-line message display with expandable details
- Clear visual distinction between sent (↑) and received (↓) messages

## Files

- `panel.html` - Main mockup showing messages with one selected
- `panel-empty.html` - Empty state before connection
- `panel-connected.html` - Connected state with various command examples
- `panel.css` - Shared styles for all mockups

## Key Features

1. **Simplified Header**
   - Connection status indicator (dot + text)
   - Tab ID (the only technical detail users need)
   - Single Connect/Disconnect button

2. **Message List**
   - Compact single-line display
   - Direction arrows (↑ outgoing, ↓ incoming)
   - Timestamps aligned to the right
   - Click to expand message details

3. **Detail View**
   - Pretty-printed JSON
   - Only appears when a message is selected
   - Resizable (in actual implementation)

4. **Dark Theme Support**
   - Automatically adapts to system preferences
   - Maintains readability in both themes

## Removed Features

- WebSocket connection details
- "Current Tab" section (except Tab ID)
- Test command buttons
- Command history section
- All "testing" UI elements

## Color Scheme

- Outgoing messages: Blue arrows (#1976d2)
- Incoming messages: Green arrows (#388e3c)
- Selected message: Light blue background (#e3f2fd)
- Connected status: Green (#4caf50)