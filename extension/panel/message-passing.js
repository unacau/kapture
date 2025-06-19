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
  // Try multiple times with increasing delays
  const maxAttempts = 5;
  const delays = [100, 200, 300, 500, 1000];
  
  for (let i = 0; i < maxAttempts; i++) {
    const isReady = await checkContentScriptReady();
    if (isReady) {
      return true;
    }
    
    // If not the last attempt, wait before trying again
    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }
  
  throw new Error('Content script not available after multiple attempts');
}

// Export functions
window.MessagePassing = {
  executeInPage,
  checkContentScriptReady,
  ensureContentScript
};
