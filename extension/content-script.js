// Content script injected into web pages
console.log('[Kapture] Content script starting...');

// Notify background script that content script is ready
chrome.runtime.sendMessage({
  type: 'contentScriptReady',
  timestamp: Date.now()
}, (response) => {
  if (chrome.runtime.lastError) {
    console.error('[Kapture] Failed to notify background:', chrome.runtime.lastError);
  } else {
    console.log('[Kapture] Background acknowledged ready state:', response);
  }
});

console.log('[Kapture] Content script ready');