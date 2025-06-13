// Export all tool definitions
export { navigateTool, goBackTool, goForwardTool } from './navigate.js';
export { clickTool, hoverTool, fillTool, selectTool } from './interact.js';
export { screenshotTool, logsTool, evaluateTool, domTool } from './capture.js';
export { listTabsTool } from './tabs.js';

// Collect all tools in an array
import { navigateTool, goBackTool, goForwardTool } from './navigate.js';
import { clickTool, hoverTool, fillTool, selectTool } from './interact.js';
import { screenshotTool, logsTool, evaluateTool, domTool } from './capture.js';
import { listTabsTool } from './tabs.js';

export const allTools = [
  navigateTool,
  goBackTool,
  goForwardTool,
  clickTool,
  hoverTool,
  fillTool,
  selectTool,
  screenshotTool,
  logsTool,
  evaluateTool,
  domTool,
  listTabsTool
];