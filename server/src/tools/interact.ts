import { z } from 'zod';

export const clickTool = {
  name: 'click',
  description: 'Click on a page element using CSS selector. Only the first matching element will be clicked. Returns the unique selector of the clicked element. Note: May experience delays if Kapture DevTools panel is not the active tab.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of element to click (uses first matching element)')
  }),
};

export const hoverTool = {
  name: 'hover',
  description: 'Hover over a page element using CSS selector. Only the first matching element will be hovered. Returns the unique selector of the hovered element. Note: May experience delays if Kapture DevTools panel is not the active tab.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of element to hover over (uses first matching element)')
  }),
};

export const fillTool = {
  name: 'fill',
  description: 'Fill an input field with a value. Only the first matching element will be filled. Returns the unique selector of the filled element.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of input field (uses first matching element)'),
    value: z.string().describe('Value to fill in the input')
  }),
};

export const selectTool = {
  name: 'select',
  description: 'Select an option from an HTML <select> dropdown element. Only the first matching select element will be used. Returns the unique selector of the select element. Note: Only works with native HTML select elements, not custom dropdowns.',
  inputSchema: z.object({
    tabId: z.string().describe('Target tab ID'),
    selector: z.string().describe('CSS selector of HTML select element (uses first matching element)'),
    value: z.string().describe('Value attribute of the option to select')
  }),
};
