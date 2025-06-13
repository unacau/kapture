// Command Executor for Kapture
// Handles execution of browser automation commands

class CommandExecutor {
  constructor() {
    this.consoleLogBuffer = [];
    this.maxLogEntries = 1000;
    this.setupConsoleCapture();
  }

  // Setup console log capturing
  setupConsoleCapture() {
    const self = this;


    // Also capture through DevTools console API if available
    if (chrome.devtools && chrome.devtools.inspectedWindow) {
      // Inject console capture script
      const captureScript = `
        (function() {
          if (window.__kaptureConsoleSetup) return;
          window.__kaptureConsoleSetup = true;
          
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;
          const originalInfo = console.info;
          
          function sendToDevTools(level, args) {
            // Convert arguments to strings
            const stringArgs = Array.from(args).map(arg => {
              try {
                if (typeof arg === 'object') {
                  return JSON.stringify(arg, null, 2);
                }
                return String(arg);
              } catch (e) {
                return '[Object - cannot stringify]';
              }
            });
            
            // Store in a global array that DevTools can access
            if (!window.__kaptureLogs) window.__kaptureLogs = [];
            window.__kaptureLogs.push({
              timestamp: Date.now(),
              level: level,
              message: stringArgs.join(' ')
            });
            
            // Keep only last 1000 entries
            if (window.__kaptureLogs.length > 1000) {
              window.__kaptureLogs.shift();
            }
          }
          
          console.log = function(...args) {
            sendToDevTools('log', args);
            return originalLog.apply(console, args);
          };
          
          console.error = function(...args) {
            sendToDevTools('error', args);
            return originalError.apply(console, args);
          };
          
          console.warn = function(...args) {
            sendToDevTools('warn', args);
            return originalWarn.apply(console, args);
          };
          
          console.info = function(...args) {
            sendToDevTools('info', args);
            return originalInfo.apply(console, args);
          };
        })();
      `;

      chrome.devtools.inspectedWindow.eval(captureScript, (result, error) => {
        if (error) {
          console.error('Failed to inject console capture:', error);
        }
      });
    }
  }

  // Execute a command
  async execute(command, params) {
    console.log(`Executing command: ${command}`, params);

    try {
      switch (command) {
        case 'kaptivemcp_navigate':
          return await this.navigate(params);

        case 'kaptivemcp_go_back':
          return await this.goBack(params);

        case 'kaptivemcp_go_forward':
          return await this.goForward(params);

        case 'kaptivemcp_screenshot':
          return await this.screenshot(params);

        case 'kaptivemcp_click':
          return await this.click(params);

        case 'kaptivemcp_logs':
          return await this.getLogs(params);

        case 'kaptivemcp_fill':
          return await this.fill(params);

        case 'kaptivemcp_select':
          return await this.select(params);

        case 'kaptivemcp_hover':
          return await this.hover(params);

        case 'kaptivemcp_evaluate':
          return await this.evaluate(params);

        default:
          throw new Error(`Unknown command: ${command}`);
      }
    } catch (error) {
      console.error('Command execution error:', error);
      throw error;
    }
  }

  // Navigate to URL
  async navigate(params) {
    const { url, timeout = 30000 } = params;

    if (!url) {
      throw new Error('URL is required for navigation');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Navigation timeout'));
      }, timeout);

      chrome.devtools.inspectedWindow.eval(
        `window.location.href = ${JSON.stringify(url)}`,
        (result, error) => {
          clearTimeout(timeoutId);

          if (error) {
            reject(new Error(`Navigation failed: ${error.toString()}`));
          } else {
            // Wait a bit for navigation to start
            setTimeout(() => {
              resolve({ url, navigated: true });
            }, 100);
          }
        }
      );
    });
  }

  // Go back in history
  async goBack(params) {
    return new Promise((resolve, reject) => {
      chrome.devtools.inspectedWindow.eval(
        'window.history.back()',
        (result, error) => {
          if (error) {
            reject(new Error(`Go back failed: ${error.toString()}`));
          } else {
            resolve({ action: 'back' });
          }
        }
      );
    });
  }

  // Go forward in history
  async goForward(params) {
    return new Promise((resolve, reject) => {
      chrome.devtools.inspectedWindow.eval(
        'window.history.forward()',
        (result, error) => {
          if (error) {
            reject(new Error(`Go forward failed: ${error.toString()}`));
          } else {
            resolve({ action: 'forward' });
          }
        }
      );
    });
  }

  // Take screenshot
  async screenshot(params) {
    const { selector, width, height } = params;

    // If selector is provided, get element bounds first
    if (selector) {
      return new Promise((resolve, reject) => {
        // Get element bounds
        chrome.devtools.inspectedWindow.eval(
          `(function() {
            const element = document.querySelector(${JSON.stringify(selector)});
            if (!element) {
              throw new Error('Element not found: ${selector}');
            }
            const rect = element.getBoundingClientRect();
            const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
            const scrollY = window.pageYOffset || document.documentElement.scrollTop;
            return {
              x: Math.round(rect.left + scrollX),
              y: Math.round(rect.top + scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              devicePixelRatio: window.devicePixelRatio || 1
            };
          })()`,
          (bounds, error) => {
            if (error) {
              reject(new Error(`Failed to get element bounds: ${error.toString()}`));
              return;
            }

            // Send screenshot request with bounds
            chrome.runtime.sendMessage({
              type: 'capture-screenshot',
              tabId: chrome.devtools.inspectedWindow.tabId,
              bounds: bounds
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(`Screenshot failed: ${chrome.runtime.lastError.message}`));
              } else if (response && response.error) {
                reject(new Error(`Screenshot failed: ${response.error}`));
              } else if (response && response.dataUrl) {
                resolve({
                  dataUrl: response.dataUrl,
                  timestamp: Date.now()
                });
              } else {
                reject(new Error('Screenshot failed: No response from background script'));
              }
            });
          }
        );
      });
    } else {
      // Full page screenshot
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'capture-screenshot',
          tabId: chrome.devtools.inspectedWindow.tabId
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Screenshot failed: ${chrome.runtime.lastError.message}`));
          } else if (response && response.error) {
            reject(new Error(`Screenshot failed: ${response.error}`));
          } else if (response && response.dataUrl) {
            resolve({
              dataUrl: response.dataUrl,
              timestamp: Date.now()
            });
          } else {
            reject(new Error('Screenshot failed: No response from background script'));
          }
        });
      });
    }
  }

  // Click element
  async click(params) {
    const { selector } = params;

    if (!selector) {
      throw new Error('Selector is required for click');
    }

    return new Promise((resolve, reject) => {
      const clickScript = `
        (function() {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!element) {
            throw new Error('Element not found: ${selector}');
          }
          
          // Simulate click
          const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          });
          
          element.dispatchEvent(event);
          
          return {
            selector: ${JSON.stringify(selector)},
            tagName: element.tagName,
            text: element.textContent.slice(0, 100)
          };
        })()
      `;

      chrome.devtools.inspectedWindow.eval(
        clickScript,
        (result, error) => {
          if (error) {
            reject(new Error(`Click failed: ${error.toString()}`));
          } else {
            resolve(result);
          }
        }
      );
    });
  }

  // Get console logs
  async getLogs(params) {
    const { max = 100 } = params;

    // First, try to get logs from the inspected window
    return new Promise((resolve) => {
      chrome.devtools.inspectedWindow.eval(
        `window.__kaptureLogs ? window.__kaptureLogs.slice(-${max}).reverse() : []`,
        (result, error) => {
          if (!error && result && result.length > 0) {
            // Use logs from inspected window
            resolve({
              logs: result,
              total: result.length
            });
          } else {
            // Fall back to local buffer
            const logs = this.consoleLogBuffer.slice(-max).reverse();
            resolve({
              logs: logs.map(log => ({
                timestamp: log.timestamp,
                level: log.level,
                message: Array.isArray(log.args) ? log.args.join(' ') : String(log.args)
              })),
              total: this.consoleLogBuffer.length
            });
          }
        }
      );
    });
  }

  // Add log entry to buffer
  addLogEntry(entry) {
    this.consoleLogBuffer.push(entry);

    // Maintain buffer size
    if (this.consoleLogBuffer.length > this.maxLogEntries) {
      this.consoleLogBuffer.shift();
    }
  }

  // Clear log buffer
  clearLogs() {
    this.consoleLogBuffer = [];
  }

  // Fill input element
  async fill(params) {
    const { selector, value } = params;

    if (!selector) {
      throw new Error('Selector is required for fill');
    }

    if (value === undefined) {
      throw new Error('Value is required for fill');
    }

    return new Promise((resolve, reject) => {
      const fillScript = `
        (function() {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!element) {
            throw new Error('Element not found: ${selector}');
          }
          
          // Check if it's an input element
          const tagName = element.tagName.toLowerCase();
          const inputTypes = ['input', 'textarea'];
          
          if (!inputTypes.includes(tagName) && !element.isContentEditable) {
            throw new Error('Element is not fillable: ' + tagName);
          }
          
          // Focus the element
          element.focus();
          
          // Clear existing value
          if (element.value !== undefined) {
            element.value = '';
          } else if (element.isContentEditable) {
            element.textContent = '';
          }
          
          // Set new value
          if (element.value !== undefined) {
            element.value = ${JSON.stringify(value)};
          } else if (element.isContentEditable) {
            element.textContent = ${JSON.stringify(value)};
          }
          
          // Trigger input and change events
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Blur to trigger any blur handlers
          element.blur();
          
          return {
            selector: ${JSON.stringify(selector)},
            tagName: element.tagName,
            value: element.value || element.textContent,
            filled: true
          };
        })()
      `;

      chrome.devtools.inspectedWindow.eval(
        fillScript,
        (result, error) => {
          if (error) {
            reject(new Error(`Fill failed: ${error.toString()}`));
          } else {
            resolve(result);
          }
        }
      );
    });
  }

  // Select option from dropdown
  async select(params) {
    const { selector, value } = params;

    if (!selector) {
      throw new Error('Selector is required for select');
    }

    if (value === undefined) {
      throw new Error('Value is required for select');
    }

    return new Promise((resolve, reject) => {
      const selectScript = `
        (function() {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!element) {
            throw new Error('Element not found: ${selector}');
          }
          
          // Check if it's a select element
          if (element.tagName.toLowerCase() !== 'select') {
            throw new Error('Element is not a select: ' + element.tagName);
          }
          
          // Find option with matching value
          const option = Array.from(element.options).find(opt => opt.value === ${JSON.stringify(value)});
          if (!option) {
            throw new Error('Option with value not found: ${value}');
          }
          
          // Select the option
          element.value = ${JSON.stringify(value)};
          option.selected = true;
          
          // Trigger change event
          element.dispatchEvent(new Event('change', { bubbles: true }));
          
          return {
            selector: ${JSON.stringify(selector)},
            value: element.value,
            selectedIndex: element.selectedIndex,
            selectedText: element.options[element.selectedIndex].text
          };
        })()
      `;

      chrome.devtools.inspectedWindow.eval(
        selectScript,
        (result, error) => {
          if (error) {
            reject(new Error(`Select failed: ${error.toString()}`));
          } else {
            resolve(result);
          }
        }
      );
    });
  }

  // Hover over element
  async hover(params) {
    const { selector } = params;

    if (!selector) {
      throw new Error('Selector is required for hover');
    }

    return new Promise((resolve, reject) => {
      const hoverScript = `
        (function() {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!element) {
            throw new Error('Element not found: ${selector}');
          }
          
          // Get element position
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          
          // Create and dispatch mouse events
          const mouseenter = new MouseEvent('mouseenter', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
          });
          
          const mouseover = new MouseEvent('mouseover', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
          });
          
          const mousemove = new MouseEvent('mousemove', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
          });
          
          element.dispatchEvent(mouseenter);
          element.dispatchEvent(mouseover);
          element.dispatchEvent(mousemove);
          
          return {
            selector: ${JSON.stringify(selector)},
            tagName: element.tagName,
            position: { x, y },
            hovered: true
          };
        })()
      `;

      chrome.devtools.inspectedWindow.eval(
        hoverScript,
        (result, error) => {
          if (error) {
            reject(new Error(`Hover failed: ${error.toString()}`));
          } else {
            resolve(result);
          }
        }
      );
    });
  }

  // Evaluate JavaScript code
  async evaluate(params) {
    const { code } = params;

    if (!code) {
      throw new Error('Code is required for evaluate');
    }

    return new Promise((resolve, reject) => {

      chrome.devtools.inspectedWindow.eval(
        code,
        (result, error) => {
          console.log('Eval result:', result);
          console.log('Eval error:', error);

          if (error) {
            reject(new Error(`Evaluate failed: ${error.toString()}`));
          } else if (result && result.error) {
            reject(new Error(`Script error: ${result.error}`));
          } else if (result && result.hasOwnProperty('value')) {
            // Extract the value from our wrapper
            resolve(result.value);
          } else {
            // Fallback to returning the raw result
            resolve(result);
          }
        }
      );
    });
  }
}

// Export for use in panel.js
window.CommandExecutor = CommandExecutor;
