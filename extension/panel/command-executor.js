// Command Executor for Kapture
// Handles execution of browser automation commands

class CommandExecutor {
  constructor() {
    this.consoleLogBuffer = [];
    this.maxLogEntries = 1000;
    this.helpersInjected = false;
    this.setupConsoleCapture();
    this.injectHelpers();
  }
  
  // Inject helper functions into the page
  async injectHelpers() {
    if (this.helpersInjected) return;
    
    try {
      const response = await fetch('page-helpers.js');
      const script = await response.text();
      
      await new Promise((resolve, reject) => {
        chrome.devtools.inspectedWindow.eval(
          script,
          (result, error) => {
            if (error) {
              console.error('Failed to inject helpers:', error);
              reject(error);
            } else {
              this.helpersInjected = true;
              console.log('Kapture helpers injected successfully');
              resolve(result);
            }
          }
        );
      });
    } catch (error) {
      console.error('Failed to load helpers:', error);
    }
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
            // Wait for navigation to complete and get new URL/title
            setTimeout(() => {
              chrome.devtools.inspectedWindow.eval(
                '({ url: window.location.href, title: document.title })',
                (navInfo, navError) => {
                  if (navError) {
                    resolve({ url, navigated: true });
                  } else {
                    resolve({ 
                      navigated: true,
                      url: navInfo.url,
                      title: navInfo.title
                    });
                  }
                }
              );
            }, 500);
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
            // Wait for navigation to complete and get new URL/title
            setTimeout(() => {
              chrome.devtools.inspectedWindow.eval(
                '({ url: window.location.href, title: document.title })',
                (navInfo, navError) => {
                  if (navError) {
                    resolve({ action: 'back' });
                  } else {
                    resolve({ 
                      action: 'back',
                      url: navInfo.url,
                      title: navInfo.title
                    });
                  }
                }
              );
            }, 300);
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
            // Wait for navigation to complete and get new URL/title
            setTimeout(() => {
              chrome.devtools.inspectedWindow.eval(
                '({ url: window.location.href, title: document.title })',
                (navInfo, navError) => {
                  if (navError) {
                    resolve({ action: 'forward' });
                  } else {
                    resolve({ 
                      action: 'forward',
                      url: navInfo.url,
                      title: navInfo.title
                    });
                  }
                }
              );
            }, 300);
          }
        }
      );
    });
  }

  // Take screenshot
  async screenshot(params) {
    const { selector, scale } = params;

    // If selector is provided, get element bounds first
    if (selector) {
      return new Promise(async (resolve, reject) => {
        await this.injectHelpers();
        
        // Get element bounds
        chrome.devtools.inspectedWindow.eval(
          `window.__kaptureHelpers.getElementBounds(${JSON.stringify(selector)})`,
          (bounds, error) => {
            if (error) {
              reject(new Error(`Failed to get element bounds: ${error.toString()}`));
              return;
            }
            
            // Check if element was not found
            if (bounds && bounds.error) {
              resolve({
                selector: bounds.selector,
                error: {
                  code: bounds.code,
                  message: 'Element not found'
                }
              });
              return;
            }

            // Send screenshot request with bounds and scale
            chrome.runtime.sendMessage({
              type: 'capture-screenshot',
              tabId: chrome.devtools.inspectedWindow.tabId,
              bounds: bounds,
              scale: scale
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(`Screenshot failed: ${chrome.runtime.lastError.message}`));
              } else if (response && response.error) {
                reject(new Error(`Screenshot failed: ${response.error}`));
              } else if (response && response.dataUrl) {
                // Get current URL and title
                chrome.devtools.inspectedWindow.eval(
                  '({ url: window.location.href, title: document.title })',
                  (navInfo) => {
                    resolve({
                      dataUrl: response.dataUrl,
                      scale: response.scale || 1,
                      timestamp: Date.now(),
                      url: navInfo?.url || '',
                      title: navInfo?.title || ''
                    });
                  }
                );
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
          tabId: chrome.devtools.inspectedWindow.tabId,
          scale: scale
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Screenshot failed: ${chrome.runtime.lastError.message}`));
          } else if (response && response.error) {
            reject(new Error(`Screenshot failed: ${response.error}`));
          } else if (response && response.dataUrl) {
            // Get current URL and title
            chrome.devtools.inspectedWindow.eval(
              '({ url: window.location.href, title: document.title })',
              (navInfo) => {
                resolve({
                  dataUrl: response.dataUrl,
                  scale: response.scale || 1,
                  timestamp: Date.now(),
                  url: navInfo?.url || '',
                  title: navInfo?.title || ''
                });
              }
            );
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
        // Ensure helpers are injected
        await this.injectHelpers();
        
        // First, get element coordinates and info
        const coords = await new Promise((resolve, reject) => {
          chrome.devtools.inspectedWindow.eval(
            `window.__kaptureHelpers.scrollAndGetElementPosition(${JSON.stringify(selector)})`,
            (result, error) => {
              if (error) {
                reject(new Error(`Failed to get element position: ${error.toString()}`));
              } else {
                resolve(result);
              }
            }
          );
        });
        
        // Check if element was not found
        if (coords.error) {
          // Return success with element not found status
          // Get current URL and title even for errors
          chrome.devtools.inspectedWindow.eval(
            '({ url: window.location.href, title: document.title })',
            (navInfo) => {
              resolve({
                selector: coords.selector,
                clicked: false,
                error: {
                  code: coords.code,
                  message: 'Element not found'
                },
                url: navInfo?.url || '',
                title: navInfo?.title || ''
              });
            }
          );
          return;
        }

        // Create visual cursor
        await new Promise((resolve, reject) => {
          chrome.devtools.inspectedWindow.eval(
            `window.__kaptureHelpers.createCursor()`,
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
              `window.__kaptureHelpers.moveCursor(${currentX}, ${currentY})`,
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
            `window.__kaptureHelpers.pulseCursor()`,
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
            `window.__kaptureHelpers.removeCursor()`,
            () => {}
          );
        }, 1000);

        // Detach debugger
        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        // Get current URL and title
        chrome.devtools.inspectedWindow.eval(
          '({ url: window.location.href, title: document.title })',
          (navInfo) => {
            resolve({
              selector: coords.selector,
              tagName: coords.tagName,
              text: coords.text,
              clicked: true,
              url: navInfo?.url || '',
              title: navInfo?.title || ''
            });
          }
        );
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
    return new Promise(async (resolve) => {
      await this.injectHelpers();
      
      chrome.devtools.inspectedWindow.eval(
        `window.__kaptureHelpers.getLogs(${max})`,
        (result, error) => {
          if (!error && result && result.length > 0) {
            // Use logs from inspected window
            // Get current URL and title
            chrome.devtools.inspectedWindow.eval(
              '({ url: window.location.href, title: document.title })',
              (navInfo) => {
                resolve({
                  logs: result,
                  total: result.length,
                  url: navInfo?.url || '',
                  title: navInfo?.title || ''
                });
              }
            );
          } else {
            // Fall back to local buffer
            const logs = this.consoleLogBuffer.slice(-max).reverse();
            // Get current URL and title
            chrome.devtools.inspectedWindow.eval(
              '({ url: window.location.href, title: document.title })',
              (navInfo) => {
                resolve({
                  logs: logs.map(log => ({
                    timestamp: log.timestamp,
                    level: log.level,
                    message: Array.isArray(log.args) ? log.args.join(' ') : String(log.args)
                  })),
                  total: this.consoleLogBuffer.length,
                  url: navInfo?.url || '',
                  title: navInfo?.title || ''
                });
              }
            );
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

    return new Promise(async (resolve, reject) => {
      await this.injectHelpers();
      
      chrome.devtools.inspectedWindow.eval(
        `window.__kaptureHelpers.fillElement(${JSON.stringify(selector)}, ${JSON.stringify(value)})`,
        (result, error) => {
          if (error) {
            reject(new Error(`Fill failed: ${error.toString()}`));
          } else {
            // Get current URL and title
            chrome.devtools.inspectedWindow.eval(
              '({ url: window.location.href, title: document.title })',
              (navInfo) => {
                // Always resolve, even if element not found or not fillable
                resolve({
                  ...result,
                  url: navInfo?.url || '',
                  title: navInfo?.title || ''
                });
              }
            );
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

    return new Promise(async (resolve, reject) => {
      await this.injectHelpers();
      
      chrome.devtools.inspectedWindow.eval(
        `window.__kaptureHelpers.selectOption(${JSON.stringify(selector)}, ${JSON.stringify(value)})`,
        (result, error) => {
          if (error) {
            reject(new Error(`Select failed: ${error.toString()}`));
          } else {
            // Get current URL and title
            chrome.devtools.inspectedWindow.eval(
              '({ url: window.location.href, title: document.title })',
              (navInfo) => {
                // Always resolve, even if element not found or option not found
                resolve({
                  ...result,
                  url: navInfo?.url || '',
                  title: navInfo?.title || ''
                });
              }
            );
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
        // Ensure helpers are injected
        await this.injectHelpers();
        
        // First, get element coordinates
        const coords = await new Promise((resolve, reject) => {
          chrome.devtools.inspectedWindow.eval(
            `window.__kaptureHelpers.scrollAndGetElementPosition(${JSON.stringify(selector)})`,
            (result, error) => {
              if (error) {
                reject(new Error(`Failed to get element position: ${error.toString()}`));
              } else {
                resolve(result);
              }
            }
          );
        });
        
        // Check if element was not found
        if (coords.error) {
          // Return success with element not found status
          // Get current URL and title even for errors
          chrome.devtools.inspectedWindow.eval(
            '({ url: window.location.href, title: document.title })',
            (navInfo) => {
              resolve({
                selector: coords.selector,
                hovered: false,
                error: {
                  code: coords.code,
                  message: 'Element not found'
                },
                url: navInfo?.url || '',
                title: navInfo?.title || ''
              });
            }
          );
          return;
        }

        // Create visual cursor
        await new Promise((resolve, reject) => {
          chrome.devtools.inspectedWindow.eval(
            `window.__kaptureHelpers.createCursor()`,
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
              `window.__kaptureHelpers.moveCursor(${currentX}, ${currentY})`,
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
            `window.__kaptureHelpers.removeCursor()`,
            () => {}
          );
        }, 1000);

        // Detach debugger
        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        // Get current URL and title
        chrome.devtools.inspectedWindow.eval(
          '({ url: window.location.href, title: document.title })',
          (navInfo) => {
            resolve({
              selector: coords.selector,
              tagName: coords.tagName,
              position: { x: coords.x, y: coords.y },
              hovered: true,
              url: navInfo?.url || '',
              title: navInfo?.title || ''
            });
          }
        );
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
          } else {
            // Get current URL and title
            chrome.devtools.inspectedWindow.eval(
              '({ url: window.location.href, title: document.title })',
              (navInfo) => {
                if (result && result.hasOwnProperty('value')) {
                  // Extract the value from our wrapper
                  resolve({
                    value: result.value,
                    url: navInfo?.url || '',
                    title: navInfo?.title || ''
                  });
                } else {
                  // Fallback to returning the raw result
                  resolve({
                    value: result,
                    url: navInfo?.url || '',
                    title: navInfo?.title || ''
                  });
                }
              }
            );
          }
        }
      );
    });
  }

  // Get DOM outerHTML
  async getDom(params) {
    const { selector } = params;

    return new Promise(async (resolve, reject) => {
      await this.injectHelpers();
      
      chrome.devtools.inspectedWindow.eval(
        `window.__kaptureHelpers.getOuterHTML(${JSON.stringify(selector || '')})`,
        (result, error) => {
          if (error) {
            reject(new Error(`Get DOM failed: ${error.toString()}`));
          } else {
            // Get current URL and title
            chrome.devtools.inspectedWindow.eval(
              '({ url: window.location.href, title: document.title })',
              (navInfo) => {
                resolve({
                  ...result,
                  url: navInfo?.url || '',
                  title: navInfo?.title || ''
                });
              }
            );
          }
        }
      );
    });
  }
}

// Export for use in panel.js
window.CommandExecutor = CommandExecutor;
