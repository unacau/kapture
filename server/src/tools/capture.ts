import { z } from 'zod';

export const screenshotTool = {
  name: 'kaptivemcp_screenshot',
  description: 'Capture a screenshot of the page or specific element',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().optional().describe('CSS selector of element to capture (optional)'),
    scale: z.number().min(0.1).max(1).default(0.5).describe('Scale factor (0.1-1.0) to reduce screenshot size (default: 0.5)')
  }),
};

export const logsTool = {
  name: 'kaptivemcp_logs',
  description: 'Retrieve console log messages from browser tab (most recent first)',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    max: z.number().optional().default(100).describe('Maximum number of log entries to return')
  }),
};

export const evaluateTool = {
  name: 'kaptivemcp_evaluate',
  description: 'Execute JavaScript code in the browser context',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    code: z.string().describe('JavaScript code to execute')
  }),
};

export const domTool = {
  name: 'kaptivemcp_dom',
  description: 'Get outerHTML of the body or a specific element',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().optional().describe('CSS selector of element (optional, defaults to body)')
  }),
};