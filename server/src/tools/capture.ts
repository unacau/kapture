import { z } from 'zod';

export const screenshotTool = {
  name: 'kaptivemcp_screenshot',
  description: 'Capture a screenshot of the page or specific element',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    name: z.string().describe('Name for the screenshot'),
    selector: z.string().optional().describe('CSS selector of element to capture (optional)'),
    width: z.number().optional().describe('Viewport width (optional)'),
    height: z.number().optional().describe('Viewport height (optional)')
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