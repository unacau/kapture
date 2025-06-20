import { z } from 'zod';

export const clickTool = {
  name: 'click',
  description: 'Click on a page element using CSS selector or XPath. Only the first matching element will be clicked. Returns the unique selector of the clicked element. Note: May experience delays if Kapture DevTools panel is not the active tab.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().optional().describe('CSS selector of element to click (uses first matching element)'),
    xpath: z.string().optional().describe('XPath expression to find element (alternative to selector)')
  }).refine(data => data.selector || data.xpath, {
    message: 'Either selector or xpath must be provided'
  }),
};

export const hoverTool = {
  name: 'hover',
  description: 'Hover over a page element using CSS selector or XPath. Only the first matching element will be hovered. Returns the unique selector of the hovered element. Note: May experience delays if Kapture DevTools panel is not the active tab.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().optional().describe('CSS selector of element to hover over (uses first matching element)'),
    xpath: z.string().optional().describe('XPath expression to find element (alternative to selector)')
  }).refine(data => data.selector || data.xpath, {
    message: 'Either selector or xpath must be provided'
  }),
};

export const fillTool = {
  name: 'fill',
  description: 'Fill an input field with a value using CSS selector or XPath. Only the first matching element will be filled. Returns the unique selector of the filled element.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().optional().describe('CSS selector of input field (uses first matching element)'),
    xpath: z.string().optional().describe('XPath expression to find input field (alternative to selector)'),
    value: z.string().describe('Value to fill in the input')
  }).refine(data => data.selector || data.xpath, {
    message: 'Either selector or xpath must be provided'
  }),
};

export const selectTool = {
  name: 'select',
  description: 'Select an option from an HTML <select> dropdown element using CSS selector or XPath. Only the first matching select element will be used. Returns the unique selector of the select element. Note: Only works with native HTML select elements, not custom dropdowns.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().optional().describe('CSS selector of HTML select element (uses first matching element)'),
    xpath: z.string().optional().describe('XPath expression to find select element (alternative to selector)'),
    value: z.string().describe('Value attribute of the option to select')
  }).refine(data => data.selector || data.xpath, {
    message: 'Either selector or xpath must be provided'
  }),
};

export const keypressTool = {
  name: 'keypress',
  description: 'Send a keypress event to the current tab or a specific element. Uses Chrome DevTools Protocol for proper key simulation including navigation keys (Tab, PageDown, arrows) and function keys. When delay > 500ms, automatically simulates holding the key down with repeated events.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    key: z.string().describe('The key combination to press. Can be a single key (e.g., "a", "Enter", "Tab", "PageDown", "F5") or a combination with modifiers (e.g., "Control+a", "Shift+Tab", "Alt+F4", "Meta+Shift+p"). Special keys: Enter, Tab, Delete, Backspace, Escape, Space, ArrowUp/Down/Left/Right, PageUp/Down, Home, End, Insert, F1-F12. Modifiers: Control (or Ctrl), Shift, Alt, Meta (or Cmd on Mac)'),
    selector: z.string().optional().describe('CSS selector of element to send keypress to (uses first matching element). If not provided, sends to the active element or body'),
    xpath: z.string().optional().describe('XPath expression to find element (alternative to selector)'),
    delay: z.number().min(0).max(60000).default(50).optional().describe('Delay in milliseconds between keydown and keyup events. Default: 50ms. Range: 0-60000ms. When > 500ms, simulates holding the key down with auto-repeat'),
    timeout: z.number().min(1000).max(70000).optional().describe('Command timeout in milliseconds. Default: 5000ms. Automatically extended for long delays')
  })
};
