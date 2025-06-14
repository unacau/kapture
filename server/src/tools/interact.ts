import { z } from 'zod';

export const clickTool = {
  name: 'kapturemcp_click',
  description: 'Click on a page element using CSS selector',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of element to click')
  }),
};

export const hoverTool = {
  name: 'kapturemcp_hover',
  description: 'Hover over a page element using CSS selector',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of element to hover over')
  }),
};

export const fillTool = {
  name: 'kapturemcp_fill',
  description: 'Fill an input field with a value',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of input field'),
    value: z.string().describe('Value to fill in the input')
  }),
};

export const selectTool = {
  name: 'kapturemcp_select',
  description: 'Select an option from a dropdown',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of select element'),
    value: z.string().describe('Value of option to select')
  }),
};
