import { z } from 'zod';

export const navigateTool = {
  name: 'kaptivemcp_navigate',
  description: 'Navigate browser tab to specified URL',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    url: z.string().url().describe('URL to navigate to'),
    timeout: z.number().optional().default(30000).describe('Navigation timeout in milliseconds')
  }),
};

export const goBackTool = {
  name: 'kaptivemcp_go_back',
  description: 'Navigate back in browser history',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID')
  }),
};

export const goForwardTool = {
  name: 'kaptivemcp_go_forward',
  description: 'Navigate forward in browser history',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID')
  }),
};