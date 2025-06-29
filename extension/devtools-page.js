// This devtools page runs alongside the panel and handles console log injection
// It has access to chrome.devtools.inspectedWindow.eval for the inspected tab

// Injection code that hijacks console methods
const injectionCode = `
  (function() {
    const isOverridden = !console.log.toString().includes('[native code]');

    // Check if already injected
    if (isOverridden) {
      return;
    }
    
    // Store original console methods
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,
      trace: console.trace,
      table: console.table,
      group: console.group,
      groupCollapsed: console.groupCollapsed,
      groupEnd: console.groupEnd,
      clear: console.clear
    };

    // Helper to serialize arguments
    function serializeArgs(args) {
      return Array.from(args).map(arg => {
        try {
          if (arg === undefined) return 'undefined';
          if (arg === null) return 'null';
          if (typeof arg === 'function') return arg.toString();
          if (typeof arg === 'object') {
            // Handle circular references
            const seen = new WeakSet();
            return JSON.stringify(arg, function(key, value) {
              if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
              }
              if (typeof value === 'function') return value.toString();
              return value;
            });
          }
          return String(arg);
        } catch (e) {
          return String(arg);
        }
      });
    }

    originalConsole.log('[Kapture] overriding console methods');
    
    // Override console methods (all except clear)
    ['log', 'error', 'warn', 'info', 'debug', 'trace', 'table', 'group', 'groupCollapsed', 'groupEnd'].forEach(level => {
      console[level] = function(...args) {
        // Create log entry
        const event = new CustomEvent('kapture-console', {
          detail: {
            level: level,
            args: serializeArgs(args),
            timestamp: new Date().toISOString(),
            stack: new Error().stack
          }
        });

        // Dispatch event for content script to capture
        window.dispatchEvent(event);
        
        // Call original method
        originalConsole[level].apply(console, args);
      };
    });
    
    // Override console.clear
    console.clear = function() {
      // Dispatch clear event
      const event = new CustomEvent('kapture-console', {
        detail: {
          level: 'clear'
        }
      });
      originalConsole.log('[Kapture] Dispatching console clear event');
      window.dispatchEvent(event);
      
      // Call original method
      originalConsole.clear.apply(console);
    };
    
    // Log that injection is complete
    originalConsole.log('[Kapture] Console capture injected into page context');
  })();
`;

// Track if we've injected for this tab
let injected = false;

// Function to inject the console hijacking code
function injectConsoleHijack() {
  if (injected) return;
  
  chrome.devtools.inspectedWindow.eval(injectionCode, (result, error) => {
    if (error) {
      console.error('[Kapture DevTools Page] Failed to inject console hijack:', error);
    } else {
      console.log('[Kapture DevTools Page] Console hijack injected successfully');
      injected = true;
    }
  });
}

// Inject immediately when devtools page loads
injectConsoleHijack();

// Re-inject on navigation (page reload)
chrome.devtools.network.onNavigated.addListener(() => {
  console.log('[Kapture DevTools Page] Page navigated, re-injecting console hijack');
  injected = false;
  // Small delay to ensure page is ready
  setTimeout(injectConsoleHijack, 100);
});

// Listen for messages from the background script to check if DevTools is open
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'checkDevToolsOpen') {
    // If this script is running, DevTools is open
    sendResponse({ devToolsOpen: true, tabId: chrome.devtools.inspectedWindow.tabId });
    return true;
  }
});