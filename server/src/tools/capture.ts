import { z } from 'zod';

export const screenshotTool = {
  name: 'kapturemcp_screenshot',
  description: 'Capture a screenshot of the page or specific element',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().optional().describe('CSS selector of element to capture (optional)'),
    scale: z.number().min(0.1).max(1).default(0.3).describe('Scale factor (0.1-1.0) to reduce screenshot size (default: 0.3)'),
    format: z.enum(['webp', 'jpeg', 'png']).default('webp').describe('Image format (default: webp for best compression)'),
    quality: z.number().min(0.1).max(1).default(0.85).describe('Compression quality for webp/jpeg (0.1-1.0, default: 0.85)')
  }),
};

export const evaluateTool = {
  name: 'kapturemcp_evaluate',
  description: 'Execute JavaScript code in the browser context. Return values are automatically serialized to JSON-safe format: functions become "[Function: name]", DOM elements include unique CSS selectors, NodeLists/HTMLCollections are converted to arrays with selectors, circular references are handled, etc.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    code: z.string().describe('JavaScript code to execute. The last expression is returned as the result.')
  }),
};

export const domTool = {
  name: 'kapturemcp_dom',
  description: 'Get outerHTML of the body or a specific element',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().optional().describe('CSS selector of element (optional, defaults to body)')
  }),
};

export const elementsFromPointTool = {
  name: 'kapturemcp_elementsFromPoint',
  description: 'Get information about all elements at a specific coordinate in the viewport',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    x: z.number().describe('X coordinate relative to the viewport'),
    y: z.number().describe('Y coordinate relative to the viewport')
  }),
};
