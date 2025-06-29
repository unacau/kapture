// Import helper functions from background-commands
import { respondWith, respondWithError } from './background-commands.js';

export async function getLogs(tabState, { before, limit = 100, level }) {
  // Check if DevTools is open by sending a message to all devtools pages
  try {
    // Try to communicate with the devtools page
    const devToolsCheckPromise = new Promise((resolve) => {
      // Set a timeout in case DevTools is not open
      const timeout = setTimeout(() => {
        resolve({ devToolsOpen: false });
      }, 100);

      // Send message to check if DevTools is open
      chrome.runtime.sendMessage({ type: 'checkDevToolsOpen' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ devToolsOpen: false });
        } else {
          resolve(response || { devToolsOpen: false });
        }
      });
    });

    const devToolsCheck = await devToolsCheckPromise;
    
    if (!devToolsCheck.devToolsOpen) {
      return respondWithError(tabState.tabId, 'DEVTOOLS_NOT_OPEN', 'Please open Chrome DevTools to use the console logs tool');
    }

    // DevTools is open, get the logs from the tab state using its built-in method
    const logs = tabState.getConsoleLogs(limit, level, before);
    
    // Check if there are more logs available
    const totalFilteredCount = tabState.getConsoleLogs(null, level, before).length;
    const hasMore = totalFilteredCount > limit;
    
    return respondWith(tabState.tabId, {
      logs: logs,
      hasMore: hasMore,
      totalCount: tabState.getConsoleLogCount()
    });
  } catch (error) {
    return respondWithError(tabState.tabId, 'CONSOLE_LOG_ERROR', error.message);
  }
}