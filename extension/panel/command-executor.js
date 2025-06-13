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

        case 'kaptivemcp_dom':
          return await this.getDom(params);

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
              return {
                error: true,
                code: 'ELEMENT_NOT_FOUND',
                selector: ${JSON.stringify(selector)}
              };
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
            if (bounds && bounds.error) {
              const err = new Error(`Element not found: ${bounds.selector}`);
              err.code = bounds.code;
              err.selector = bounds.selector;
              reject(err);
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

    const tabId = chrome.devtools.inspectedWindow.tabId;

    return new Promise(async (resolve, reject) => {
      let debuggerAttached = false;
      
      try {
        // First, get element coordinates and info
        const coords = await new Promise((resolve, reject) => {
          chrome.devtools.inspectedWindow.eval(
            `(function() {
              const element = document.querySelector(${JSON.stringify(selector)});
              if (!element) {
                return {
                  error: true,
                  code: 'ELEMENT_NOT_FOUND',
                  selector: ${JSON.stringify(selector)}
                };
              }
              
              // Scroll element into view if needed
              element.scrollIntoViewIfNeeded ? element.scrollIntoViewIfNeeded() : element.scrollIntoView({ block: 'center' });
              
              // Get element position
              const rect = element.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              
              return {
                x: x,
                y: y,
                selector: ${JSON.stringify(selector)},
                tagName: element.tagName,
                text: element.textContent.slice(0, 100)
              };
            })()`,
            (result, error) => {
              if (error) {
                reject(new Error(`Failed to get element position: ${error.toString()}`));
              } else if (result && result.error) {
                const err = new Error(`Element not found: ${result.selector}`);
                err.code = result.code;
                err.selector = result.selector;
                reject(err);
              } else {
                resolve(result);
              }
            }
          );
        });

        // Create visual cursor
        await new Promise((resolve, reject) => {
          chrome.devtools.inspectedWindow.eval(
            `(function() {
              // Remove any existing cursor
              const existingCursor = document.getElementById('kapture-mouse-cursor');
              if (existingCursor) existingCursor.remove();
              
              // Create cursor element
              const cursor = document.createElement('div');
              cursor.id = 'kapture-mouse-cursor';
              cursor.innerHTML = \`
                <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="40" height="40" viewBox="0 0 30 30">
                    <path d="M 9 3 A 1 1 0 0 0 8 4 L 8 21 A 1 1 0 0 0 9 22 A 1 1 0 0 0 9.796875 21.601562 L 12.919922 18.119141 L 16.382812 26.117188 C 16.701812 26.855187 17.566828 27.188469 18.298828 26.855469 C 19.020828 26.527469 19.340672 25.678078 19.013672 24.955078 L 15.439453 17.039062 L 21 17 A 1 1 0 0 0 22 16 A 1 1 0 0 0 21.628906 15.222656 L 9.7832031 3.3789062 A 1 1 0 0 0 9 3 z"></path>
                </svg>
              \`;
              cursor.style.cssText = \`
                position: fixed;
                width: 20px;
                height: 20px;
                pointer-events: none;
                z-index: 999999;
                transform: translate(0, 0);
                transition: none;
              \`;
              document.body.appendChild(cursor);
              return true;
            })()`,
            (result, error) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
        });

        // Attach debugger
        await chrome.debugger.attach({ tabId }, '1.3');
        debuggerAttached = true;

        // Move mouse to element with smooth animation
        const steps = 20;
        const startX = 0;
        const startY = 0;

        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          // Use easing function for smooth movement
          const easeProgress = 1 - Math.pow(1 - progress, 3); // cubic ease-out
          const currentX = startX + (coords.x - startX) * easeProgress;
          const currentY = startY + (coords.y - startY) * easeProgress;

          // Update visual cursor position
          await new Promise((resolve) => {
            chrome.devtools.inspectedWindow.eval(
              `(function() {
                const cursor = document.getElementById('kapture-mouse-cursor');
                if (cursor) {
                  cursor.style.left = '${currentX}px';
                  cursor.style.top = '${currentY}px';
                }
              })()`,
              () => resolve()
            );
          });

          await chrome.debugger.sendCommand(
            { tabId },
            'Input.dispatchMouseEvent',
            {
              type: 'mouseMoved',
              x: Math.round(currentX),
              y: Math.round(currentY)
            }
          );

          // Small delay between steps for smooth animation
          if (i < steps) {
            await new Promise(r => setTimeout(r, 20));
          }
        }

        // Perform the click at the final position
        // Mouse down
        await chrome.debugger.sendCommand(
          { tabId },
          'Input.dispatchMouseEvent',
          {
            type: 'mousePressed',
            x: Math.round(coords.x),
            y: Math.round(coords.y),
            button: 'left',
            clickCount: 1
          }
        );

        // Visual feedback - make cursor pulse
        await new Promise((resolve) => {
          chrome.devtools.inspectedWindow.eval(
            `(function() {
              const cursor = document.getElementById('kapture-mouse-cursor');
              if (cursor) {
                cursor.style.transform = 'scale(0.8)';
                setTimeout(() => {
                  cursor.style.transform = 'scale(1)';
                }, 100);
              }
            })()`,
            () => resolve()
          );
        });

        await new Promise(r => setTimeout(r, 50));

        // Mouse up
        await chrome.debugger.sendCommand(
          { tabId },
          'Input.dispatchMouseEvent',
          {
            type: 'mouseReleased',
            x: Math.round(coords.x),
            y: Math.round(coords.y),
            button: 'left',
            clickCount: 1
          }
        );

        // Remove cursor after a short delay
        setTimeout(() => {
          chrome.devtools.inspectedWindow.eval(
            `document.getElementById('kapture-mouse-cursor')?.remove()`,
            () => {}
          );
        }, 500);

        // Detach debugger
        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        resolve({
          selector: coords.selector,
          tagName: coords.tagName,
          text: coords.text,
          clicked: true
        });
      } catch (error) {
        // Make sure to detach debugger on error
        if (debuggerAttached) {
          try {
            await chrome.debugger.detach({ tabId });
          } catch (detachError) {
            // Ignore detach errors
          }
        }
        
        reject(new Error(`Click failed: ${error.message}`));
      }
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
            return {
              error: true,
              code: 'ELEMENT_NOT_FOUND',
              selector: ${JSON.stringify(selector)}
            };
          }
          
          // Check if it's an input element
          const tagName = element.tagName.toLowerCase();
          const inputTypes = ['input', 'textarea'];
          
          if (!inputTypes.includes(tagName) && !element.isContentEditable) {
            return {
              error: true,
              code: 'INVALID_ELEMENT',
              message: 'Element is not fillable: ' + tagName,
              selector: ${JSON.stringify(selector)}
            };
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
          } else if (result && result.error) {
            const err = new Error(result.message || `Element not found: ${result.selector}`);
            err.code = result.code;
            err.selector = result.selector;
            reject(err);
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
            return {
              error: true,
              code: 'ELEMENT_NOT_FOUND',
              selector: ${JSON.stringify(selector)}
            };
          }
          
          // Check if it's a select element
          if (element.tagName.toLowerCase() !== 'select') {
            return {
              error: true,
              code: 'INVALID_ELEMENT',
              message: 'Element is not a select: ' + element.tagName,
              selector: ${JSON.stringify(selector)}
            };
          }
          
          // Find option with matching value
          const option = Array.from(element.options).find(opt => opt.value === ${JSON.stringify(value)});
          if (!option) {
            return {
              error: true,
              code: 'OPTION_NOT_FOUND',
              message: 'Option with value not found: ${value}',
              selector: ${JSON.stringify(selector)},
              value: ${JSON.stringify(value)}
            };
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
          } else if (result && result.error) {
            const err = new Error(result.message || `Element not found: ${result.selector}`);
            err.code = result.code;
            err.selector = result.selector;
            if (result.value) err.value = result.value;
            reject(err);
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

    const tabId = chrome.devtools.inspectedWindow.tabId;

    return new Promise(async (resolve, reject) => {
      let debuggerAttached = false;

      try {
        // First, get element coordinates
        const coords = await new Promise((resolve, reject) => {
          chrome.devtools.inspectedWindow.eval(
            `(function() {
              const element = document.querySelector(${JSON.stringify(selector)});
              if (!element) {
                return {
                  error: true,
                  code: 'ELEMENT_NOT_FOUND',
                  selector: ${JSON.stringify(selector)}
                };
              }
              
              // Scroll element into view if needed
              element.scrollIntoViewIfNeeded ? element.scrollIntoViewIfNeeded() : element.scrollIntoView({ block: 'center' });
              
              // Get element position
              const rect = element.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              
              return {
                x: x,
                y: y,
                selector: ${JSON.stringify(selector)},
                tagName: element.tagName
              };
            })()`,
            (result, error) => {
              if (error) {
                reject(new Error(`Failed to get element position: ${error.toString()}`));
              } else if (result && result.error) {
                const err = new Error(`Element not found: ${result.selector}`);
                err.code = result.code;
                err.selector = result.selector;
                reject(err);
              } else {
                resolve(result);
              }
            }
          );
        });

        // Create visual cursor
        await new Promise((resolve, reject) => {
          chrome.devtools.inspectedWindow.eval(
            `(function() {
              // Remove any existing cursor
              const existingCursor = document.getElementById('kapture-mouse-cursor');
              if (existingCursor) existingCursor.remove();
              
              // Create cursor element
              const cursor = document.createElement('div');
              cursor.id = 'kapture-mouse-cursor';
              cursor.innerHTML = \`
                <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="40" height="40" viewBox="0 0 30 30">
                    <path d="M 9 3 A 1 1 0 0 0 8 4 L 8 21 A 1 1 0 0 0 9 22 A 1 1 0 0 0 9.796875 21.601562 L 12.919922 18.119141 L 16.382812 26.117188 C 16.701812 26.855187 17.566828 27.188469 18.298828 26.855469 C 19.020828 26.527469 19.340672 25.678078 19.013672 24.955078 L 15.439453 17.039062 L 21 17 A 1 1 0 0 0 22 16 A 1 1 0 0 0 21.628906 15.222656 L 9.7832031 3.3789062 A 1 1 0 0 0 9 3 z"></path>
                </svg>
              \`;
              cursor.style.cssText = \`
                position: fixed;
                width: 20px;
                height: 20px;
                pointer-events: none;
                z-index: 999999;
                transform: translate(0, 0);
                transition: none;
              \`;
              document.body.appendChild(cursor);
              return true;
            })()`,
            (result, error) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
        });

        // Attach debugger
        await chrome.debugger.attach({ tabId }, '1.3');
        debuggerAttached = true;

        // Move mouse to element with smooth animation
        const steps = 20;
        const startX = 0; //coords.x - 100;
        const startY = 0; //coords.y - 100;

        for (let i = 0; i <= steps; i++) {
          const progress = i / steps;
          // Use easing function for smooth movement
          const easeProgress = 1 - Math.pow(1 - progress, 3); // cubic ease-out
          const currentX = startX + (coords.x - startX) * easeProgress;
          const currentY = startY + (coords.y - startY) * easeProgress;

          // Update visual cursor position
          await new Promise((resolve) => {
            chrome.devtools.inspectedWindow.eval(
              `(function() {
                const cursor = document.getElementById('kapture-mouse-cursor');
                if (cursor) {
                  cursor.style.left = '${currentX}px';
                  cursor.style.top = '${currentY}px';
                }
              })()`,
              () => resolve()
            );
          });

          await chrome.debugger.sendCommand(
            { tabId },
            'Input.dispatchMouseEvent',
            {
              type: 'mouseMoved',
              x: Math.round(currentX),
              y: Math.round(currentY)
            }
          );

          // Small delay between steps for smooth animation
          if (i < steps) {
            await new Promise(r => setTimeout(r, 20));
          }
        }

        // Remove cursor after a short delay
        setTimeout(() => {
          chrome.devtools.inspectedWindow.eval(
            `document.getElementById('kapture-mouse-cursor')?.remove()`,
            () => {}
          );
        }, 1000);

        // Detach debugger
        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        resolve({
          selector: coords.selector,
          tagName: coords.tagName,
          position: { x: coords.x, y: coords.y },
          hovered: true
        });
      } catch (error) {
        // Make sure to detach debugger on error
        if (debuggerAttached) {
          try {
            await chrome.debugger.detach({ tabId });
          } catch (detachError) {
            // Ignore detach errors
          }
        }

        reject(new Error(`Hover failed: ${error.message}`));
      }
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

  // Get DOM outerHTML
  async getDom(params) {
    const { selector } = params;

    return new Promise((resolve, reject) => {
      const domScript = selector ? `
        (function() {
          const element = document.querySelector(${JSON.stringify(selector)});
          if (!element) {
            return {
              error: true,
              code: 'ELEMENT_NOT_FOUND',
              selector: ${JSON.stringify(selector)}
            };
          }
          return {
            html: element.outerHTML,
            selector: ${JSON.stringify(selector)}
          };
        })()
      ` : `document.body.outerHTML`;

      chrome.devtools.inspectedWindow.eval(
        domScript,
        (result, error) => {
          if (error) {
            reject(new Error(`Get DOM failed: ${error.toString()}`));
          } else if (result && result.error) {
            const err = new Error(`Element not found: ${result.selector}`);
            err.code = result.code;
            err.selector = result.selector;
            reject(err);
          } else {
            resolve({
              html: result,
              selector: selector || 'body'
            });
          }
        }
      );
    });
  }
}

// Export for use in panel.js
window.CommandExecutor = CommandExecutor;
