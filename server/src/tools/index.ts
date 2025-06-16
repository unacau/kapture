// Export all tool definitions
export { navigateTool, goBackTool, goForwardTool } from './navigate.js';
export { clickTool, hoverTool, fillTool, selectTool } from './interact.js';
export { screenshotTool, evaluateTool, domTool, elementsFromPointTool } from './capture.js';
export { listTabsTool } from './tabs.js';

// Collect all tools in an array
import { navigateTool, goBackTool, goForwardTool } from './navigate.js';
import { clickTool, hoverTool, fillTool, selectTool } from './interact.js';
import { screenshotTool, evaluateTool, domTool, elementsFromPointTool } from './capture.js';
import { listTabsTool } from './tabs.js';

export const allTools = [
  navigateTool,
  goBackTool,
  goForwardTool,
  clickTool,
  hoverTool,
  fillTool,
  selectTool,
  // screenshotTool,  // Disabled - use kapturemcp://tab/{tabId}/screenshot resource instead
  evaluateTool,
  // domTool,  // Disabled - use kapturemcp://tab/{tabId}/dom resource instead
  // elementsFromPointTool,
  // listTabsTool  // Disabled - use kapturemcp://tabs resource instead
];
