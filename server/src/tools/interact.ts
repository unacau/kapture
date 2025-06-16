import { z } from 'zod';

export const clickTool = {
  name: 'click',
  description: 'Click on a page element using CSS selector. Note: May experience delays if Kapture DevTools panel is not the active tab.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of element to click')
  }),
};

export const hoverTool = {
  name: 'hover',
  description: 'Hover over a page element using CSS selector. Note: May experience delays if Kapture DevTools panel is not the active tab.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of element to hover over')
  }),
};

export const fillTool = {
  name: 'fill',
  description: 'Fill an input field with a value',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of input field'),
    value: z.string().describe('Value to fill in the input')
  }),
};

export const selectTool = {
  name: 'select',
  description: 'Select an option from an HTML <select> dropdown element. Note: Only works with native HTML select elements, not custom dropdowns.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of HTML select element'),
    value: z.string().describe('Value attribute of the option to select')
  }),
};
