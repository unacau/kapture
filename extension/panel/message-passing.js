// Message passing utilities for DevTools panel
// Handles communication with content scripts via background service worker

let messageIdCounter = 0;

// Generate unique request ID
function generateRequestId() {
  return `req_${Date.now()}_${++messageIdCounter}`;
}

// Execute command in page via message passing
async function executeInPage(command, params, timeout = 5000) {
  const requestId = generateRequestId();
  const tabId = chrome.devtools.inspectedWindow.tabId;

  return new Promise((resolve, reject) => {
    let timeoutId;

    // Set up response listener
    const listener = (response) => {
      if (response.type === 'kapture-response' && response.requestId === requestId) {
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);

        if (response.success) {
          resolve(response.result);
        } else {
          const error = new Error(response.error.message);
          error.code = response.error.code;
          reject(error);
        }
      }
    };

    // Add listener
    chrome.runtime.onMessage.addListener(listener);

    // Set timeout
    timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error(`Command timeout: ${command}`));
    }, timeout);

    // Send command via background script
    chrome.runtime.sendMessage({
      type: 'kapture-command',
      tabId: tabId.toString(),
      command: command,
      params: params,
      requestId: requestId
    }, (response) => {
      // Handle synchronous response from background script
      if (chrome.runtime.lastError) {
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && response.type === 'kapture-response') {
        // Background script returned immediately (e.g., injection error)
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);

        if (response.success) {
          resolve(response.result);
        } else {
          const error = new Error(response.error.message);
          error.code = response.error.code;
          reject(error);
        }
      }
      // Otherwise, wait for async response via listener
    });
  });
}


// Check if content script is ready
async function checkContentScriptReady() {
  try {
    const result = await executeInPage('getTabInfo', {}, 1000);
    return true;
  } catch (error) {
    return false;
  }
}

// Ensure content script is loaded
async function ensureContentScript() {
  const isReady = await checkContentScriptReady();
  if (!isReady) {
    // Content script should be auto-injected by background script
    // Wait a bit and check again
    await new Promise(resolve => setTimeout(resolve, 100));
    const isReadyAfterWait = await checkContentScriptReady();
    if (!isReadyAfterWait) {
      throw new Error('Content script not available');
    }
  }
  return true;
}

// Export functions
window.MessagePassing = {
  executeInPage,
  checkContentScriptReady,
  ensureContentScript
};
