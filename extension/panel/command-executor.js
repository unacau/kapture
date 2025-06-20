// Command Executor for Kapture
// Handles execution of browser automation commands


class CommandExecutor {
  constructor() {
    // Note: Console log capture is now handled by the content script
  }

  // Shared validation for selector/xpath parameters
  validateSelectorOrXPath(params, commandName) {
    const { selector, xpath } = params;

    if (!selector && !xpath) {
      throw new Error(`Either selector or xpath is required for ${commandName}`);
    }

    // Validate selector if provided
    if (selector) {
      const validation = this.validateSelector(selector);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    return { selector, xpath };
  }

  // Helper function to get tab info with consistent error handling
  async getTabInfoWithCommand(commandResult) {
    try {
      const tabInfo = await window.MessagePassing.executeInPage('getTabInfo', {});
      return {
        ...commandResult,
        ...tabInfo
      };
    } catch (error) {
      throw new Error(`Command succeeded but failed to get tab info: ${error.message}`);
    }
  }

  // Validate CSS selector
  validateSelector(selector) {
    // Check for :contains() pseudo-selector
    if (selector && selector.includes(':contains(')) {
      return {
        valid: false,
        error: 'The :contains() pseudo-selector is not valid CSS and is not supported by browsers. Use the xpath parameter instead, e.g., xpath: "//button[contains(text(), \'Submit\')]"'
      };
    }

    // Could add more validation here in the future
    return { valid: true };
  }

  // Execute a command
  async execute(command, params) {
    console.log(`Executing command: ${command}`, params);

    try {
      switch (command) {
        case 'navigate':
          return await this.navigate(params);

        case 'back':
          return await this.goBack(params);

        case 'forward':
          return await this.goForward(params);

        case 'screenshot':
          return await this.screenshot(params);

        case 'click':
          return await this.click(params);

        case 'fill':
          return await this.fill(params);

        case 'select':
          return await this.select(params);

        case 'keypress':
          return await this.keypress(params);

        case 'hover':
          return await this.hover(params);

        case 'evaluate':
          return await this.evaluate(params);

        case 'dom':
          return await this.getDom(params);

        case 'elementsFromPoint':
          return await this.getElementsFromPoint(params);

        case 'querySelectorAll':
          return await this.querySelectorAll(params);

        case 'getLogs':
          return await this.getLogs(params);

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

    try {
      const result = await window.MessagePassing.executeInPage('navigate', { url }, timeout);
      // Wait a bit for navigation to complete, then get updated tab info
      await new Promise(resolve => setTimeout(resolve, 500));
      return await this.getTabInfoWithCommand({ navigated: true });
    } catch (error) {
      throw new Error(`Navigation failed: ${error.message}`);
    }
  }

  // Go back in history
  async goBack(params) {
    try {
      const result = await window.MessagePassing.executeInPage('goBack', {});
      // Wait a bit for navigation to complete, then get updated tab info
      await new Promise(resolve => setTimeout(resolve, 300));
      return await this.getTabInfoWithCommand({ action: 'back' });
    } catch (error) {
      throw new Error(`Go back failed: ${error.message}`);
    }
  }

  // Go forward in history
  async goForward(params) {
    try {
      const result = await window.MessagePassing.executeInPage('goForward', {});
      // Wait a bit for navigation to complete, then get updated tab info
      await new Promise(resolve => setTimeout(resolve, 300));
      return await this.getTabInfoWithCommand({ action: 'forward' });
    } catch (error) {
      throw new Error(`Go forward failed: ${error.message}`);
    }
  }

  // Take screenshot
  async screenshot(params) {
    const { scale, format, quality } = params;
    let selector, xpath;

    // If selector or xpath is provided, validate and get element bounds
    if (params.selector || params.xpath) {
      ({ selector, xpath } = this.validateSelectorOrXPath(params, 'screenshot'));
      return new Promise(async (resolve, reject) => {
        // Get element bounds
        let bounds;
        try {
          bounds = await window.MessagePassing.executeInPage('getElementBounds', { selector, xpath });
        } catch (error) {
          reject(new Error(`Failed to get element bounds: ${error.message}`));
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
          scale: scale,
          format: format,
          quality: quality
        }, async (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Screenshot failed: ${chrome.runtime.lastError.message}`));
          } else if (response && response.error) {
            reject(new Error(`Screenshot failed: ${response.error}`));
          } else if (response && response.dataUrl) {
            // Get current URL and title
            this.getTabInfoWithCommand({
              dataUrl: response.dataUrl,
              scale: response.scale || 1,
              format: response.format || 'png',
              quality: response.quality,
              timestamp: Date.now()
            }).then(result => {
              resolve(result);
            }).catch(err => {
              reject(err);
            });
          } else {
            reject(new Error('Screenshot failed: No response from background script'));
          }
        });
      });
    } else {
      // Full page screenshot
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'capture-screenshot',
          tabId: chrome.devtools.inspectedWindow.tabId,
          scale: scale,
          format: format,
          quality: quality
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Screenshot failed: ${chrome.runtime.lastError.message}`));
          } else if (response && response.error) {
            reject(new Error(`Screenshot failed: ${response.error}`));
          } else if (response && response.dataUrl) {
            // Get current URL and title
            this.getTabInfoWithCommand({
              dataUrl: response.dataUrl,
              scale: response.scale || 1,
              format: response.format || 'png',
              quality: response.quality,
              timestamp: Date.now()
            }).then(result => {
              resolve(result);
            }).catch(err => {
              reject(err);
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
    const { selector, xpath } = this.validateSelectorOrXPath(params, 'click');

    const tabId = chrome.devtools.inspectedWindow.tabId;

    return new Promise(async (resolve, reject) => {
      let debuggerAttached = false;

      try {
        // First, get element coordinates and info
        let coords;
        try {
          coords = await window.MessagePassing.executeInPage('scrollAndGetElementPosition', { selector, xpath });
        } catch (error) {
          throw new Error(`Failed to get element position: ${error.message}`);
        }

        // Check if element was not found or not visible
        if (coords.error) {
          // Return success with appropriate error status
          try {
            const responseData = {
              selector: coords.selector,
              clicked: false,
              error: {
                code: coords.code,
                message: coords.message || (coords.code === 'ELEMENT_NOT_FOUND' ? 'Element not found' : 'Element is not visible')
              }
            };

            // Include element info if available (for visibility errors)
            if (coords.elementInfo) {
              responseData.elementInfo = coords.elementInfo;
            }

            const result = await this.getTabInfoWithCommand(responseData);
            resolve(result);
          } catch (err) {
            reject(err);
          }
          return;
        }

        // Create visual cursor
        await window.MessagePassing.executeInPage('showCursor', {});

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
          await window.MessagePassing.executeInPage('moveCursor', { x: currentX, y: currentY });

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
        await window.MessagePassing.executeInPage('pulseCursor', {});

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
          window.MessagePassing.executeInPage('hideCursor', {});
        }, 1000);

        // Detach debugger
        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        // Get current URL and title
        try {
          const result = await this.getTabInfoWithCommand({
            selector: coords.selector,
            clicked: true
          });
          resolve(result);
        } catch (err) {
          reject(err);
        }
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


  // Fill input element
  async fill(params) {
    const { selector, xpath } = this.validateSelectorOrXPath(params, 'fill');
    const { value } = params;

    if (value === undefined) {
      throw new Error('Value is required for fill');
    }

    try {
      const result = await window.MessagePassing.executeInPage('fill', { selector, xpath, value });
      return await this.getTabInfoWithCommand(result);
    } catch (error) {
      throw new Error(`Fill failed: ${error.message}`);
    }
  }

  // Select option from dropdown
  async select(params) {
    const { selector, xpath } = this.validateSelectorOrXPath(params, 'select');
    const { value } = params;

    if (value === undefined) {
      throw new Error('Value is required for select');
    }

    try {
      const result = await window.MessagePassing.executeInPage('select', { selector, xpath, value });

      // Check if the command returned an error (element not found or wrong type)
      if (result && result.error) {
        if (result.code === 'INVALID_ELEMENT') {
          // Return success:true with error details for graceful handling
          return {
            selected: false,
            error: {
              code: result.code,
              message: `Element is not an HTML <select> element. Found: <${result.message.split(': ')[1]}>. This tool only works with native HTML select dropdowns.`
            },
            selector: result.selector
          };
        } else if (result.code === 'ELEMENT_NOT_FOUND') {
          // Return success:true with error details for graceful handling
          return {
            selected: false,
            error: {
              code: result.code,
              message: `No element found matching selector: ${result.selector}`
            },
            selector: result.selector
          };
        } else if (result.code === 'OPTION_NOT_FOUND') {
          // Return success:true with error details for graceful handling
          return {
            selected: false,
            error: {
              code: result.code,
              message: result.message
            },
            selector: result.selector,
            options: result.options
          };
        }
      }

      return await this.getTabInfoWithCommand(result);
    } catch (error) {
      throw new Error(`Select failed: ${error.message}`);
    }
  }

  // Send keypress event
  async keypress(params) {
    const { key, selector, xpath, delay = 50 } = params;

    if (!key) {
      throw new Error('Key is required for keypress');
    }

    // Validate delay is within reasonable bounds (0-60000ms = 0-60 seconds)
    const keypressDelay = Math.max(0, Math.min(60000, delay));

    const tabId = chrome.devtools.inspectedWindow.tabId;

    return new Promise(async (resolve, reject) => {
      let debuggerAttached = false;

      try {
        // First, find and focus the target element if selector/xpath provided
        if (selector || xpath) {
          try {
            const focusResult = await window.MessagePassing.executeInPage('focusElement', { selector, xpath });
            if (focusResult.error) {
              // Return success with error status for graceful handling
              const result = await this.getTabInfoWithCommand({
                selector: focusResult.selector,
                keyPressed: false,
                error: {
                  code: focusResult.code,
                  message: focusResult.message || 'Element not found'
                }
              });
              resolve(result);
              return;
            }
          } catch (error) {
            throw new Error(`Failed to focus element: ${error.message}`);
          }
        }

        // Parse key combination to extract key and modifiers
        const keyData = this.parseKeyCombination(key);

        // Attach debugger
        await chrome.debugger.attach({ tabId }, '1.3');
        debuggerAttached = true;

        console.log(`Sending keyDown for key: ${keyData.key} (code: ${keyData.code}, modifiers: ${keyData.modifiers})`);
        // Send initial keydown event
        await chrome.debugger.sendCommand(
          { tabId },
          'Input.dispatchKeyEvent',
          {
            type: 'keyDown',
            key: keyData.key,
            code: keyData.code,
            windowsVirtualKeyCode: keyData.keyCode,
            nativeVirtualKeyCode: keyData.keyCode,
            modifiers: keyData.modifiers,
            autoRepeat: false
          }
        );

        // For character keys, send char event
        if (keyData.text) {
          await chrome.debugger.sendCommand(
            { tabId },
            'Input.dispatchKeyEvent',
            {
              type: 'char',
              text: keyData.text,
              key: keyData.key,
              code: keyData.code,
              windowsVirtualKeyCode: keyData.keyCode,
              nativeVirtualKeyCode: keyData.keyCode,
              modifiers: keyData.modifiers
            }
          );
        }

        // If delay > 500ms, simulate key repeat
        if (keypressDelay > 500) {
          // Calculate number of repeat events based on delay
          // Typical repeat rate is ~30ms between events
          const repeatInterval = 30;
          const repeatCount = Math.floor((keypressDelay - 100) / repeatInterval);
          
          // Wait a bit before starting repeat (typical OS behavior)
          await new Promise(r => setTimeout(r, 100));
          
          // Send repeated keydown events
          for (let i = 0; i < repeatCount; i++) {
            await chrome.debugger.sendCommand(
              { tabId },
              'Input.dispatchKeyEvent',
              {
                type: 'keyDown',
                key: keyData.key,
                code: keyData.code,
                windowsVirtualKeyCode: keyData.keyCode,
                nativeVirtualKeyCode: keyData.keyCode,
                modifiers: keyData.modifiers,
                autoRepeat: true
              }
            );
            
            // For character keys, also repeat the char event
            if (keyData.text) {
              await chrome.debugger.sendCommand(
                { tabId },
                'Input.dispatchKeyEvent',
                {
                  type: 'char',
                  text: keyData.text,
                  key: keyData.key,
                  code: keyData.code,
                  windowsVirtualKeyCode: keyData.keyCode,
                  nativeVirtualKeyCode: keyData.keyCode,
                  modifiers: keyData.modifiers
                }
              );
            }
            
            // Wait between repeat events
            if (i < repeatCount - 1) {
              await new Promise(r => setTimeout(r, repeatInterval));
            }
          }
        } else if (keypressDelay > 0) {
          // For delays <= 500ms, just wait the specified time
          await new Promise(r => setTimeout(r, keypressDelay));
        }

        console.log(`Sending keyUp for key: ${keyData.key}, code: ${keyData.code}, modifiers: ${keyData.modifiers}`);
        // Send keyup event
        await chrome.debugger.sendCommand(
          { tabId },
          'Input.dispatchKeyEvent',
          {
            type: 'keyUp',
            key: keyData.key,
            code: keyData.code,
            windowsVirtualKeyCode: keyData.keyCode,
            nativeVirtualKeyCode: keyData.keyCode,
            modifiers: keyData.modifiers
          }
        );

        // Detach debugger
        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        // Wait a bit for the page to process the key events
        await new Promise(r => setTimeout(r, 100));

        // Get result including element info if selector was provided
        const resultData = {
          keyPressed: true,
          key: key,
          delay: keypressDelay
        };

        // If this was an auto-repeat key press, include that info
        if (keypressDelay > 500) {
          resultData.autoRepeat = true;
          resultData.repeatCount = Math.floor((keypressDelay - 100) / 30);
        }

        if (selector || xpath) {
          try {
            const elementInfo = await window.MessagePassing.executeInPage('getElementInfo', { selector, xpath });
            if (!elementInfo.error) {
              resultData.selector = elementInfo.selector;
              resultData.elementInfo = elementInfo;
            }
          } catch (e) {
            // Ignore errors getting element info
          }
        }

        try {
          const result = await this.getTabInfoWithCommand(resultData);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      } catch (error) {
        // Make sure to detach debugger on error
        if (debuggerAttached) {
          try {
            await chrome.debugger.detach({ tabId });
          } catch (detachError) {
            // Ignore detach errors
          }
        }

        reject(new Error(`Keypress failed: ${error.message}`));
      }
    });
  }

  // Parse key combination and return CDP-compatible key data
  parseKeyCombination(keyCombination) {
    let modifiers = 0;
    let key = '';

    // CDP modifier flags
    const CDP_MODIFIERS = {
      alt: 1,
      ctrl: 2,
      meta: 4,
      shift: 8
    };

    // Special key mappings
    const KEY_MAPPINGS = {
      'enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
      'return': { key: 'Enter', code: 'Enter', keyCode: 13 },
      'tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
      'delete': { key: 'Delete', code: 'Delete', keyCode: 46 },
      'backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
      'escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
      'esc': { key: 'Escape', code: 'Escape', keyCode: 27 },
      'space': { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
      ' ': { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
      'arrowup': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
      'arrowdown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      'arrowleft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
      'arrowright': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
      'pageup': { key: 'PageUp', code: 'PageUp', keyCode: 33 },
      'pagedown': { key: 'PageDown', code: 'PageDown', keyCode: 34 },
      'home': { key: 'Home', code: 'Home', keyCode: 36 },
      'end': { key: 'End', code: 'End', keyCode: 35 },
      'insert': { key: 'Insert', code: 'Insert', keyCode: 45 },
      'f1': { key: 'F1', code: 'F1', keyCode: 112 },
      'f2': { key: 'F2', code: 'F2', keyCode: 113 },
      'f3': { key: 'F3', code: 'F3', keyCode: 114 },
      'f4': { key: 'F4', code: 'F4', keyCode: 115 },
      'f5': { key: 'F5', code: 'F5', keyCode: 116 },
      'f6': { key: 'F6', code: 'F6', keyCode: 117 },
      'f7': { key: 'F7', code: 'F7', keyCode: 118 },
      'f8': { key: 'F8', code: 'F8', keyCode: 119 },
      'f9': { key: 'F9', code: 'F9', keyCode: 120 },
      'f10': { key: 'F10', code: 'F10', keyCode: 121 },
      'f11': { key: 'F11', code: 'F11', keyCode: 122 },
      'f12': { key: 'F12', code: 'F12', keyCode: 123 }
    };

    // Parse modifiers from combination
    let remaining = keyCombination;
    const modifierPatterns = [
      { pattern: /^(Control|Ctrl)\+/i, modifier: 'ctrl' },
      { pattern: /^Shift\+/i, modifier: 'shift' },
      { pattern: /^Alt\+/i, modifier: 'alt' },
      { pattern: /^(Meta|Cmd|Command)\+/i, modifier: 'meta' }
    ];

    // Extract modifiers
    let foundModifier = true;
    while (foundModifier && remaining) {
      foundModifier = false;
      for (const { pattern, modifier } of modifierPatterns) {
        if (pattern.test(remaining)) {
          modifiers |= CDP_MODIFIERS[modifier];
          remaining = remaining.replace(pattern, '');
          foundModifier = true;
          break;
        }
      }
    }

    // What's left is the key
    key = remaining;

    // Look up special key mapping
    const lowerKey = key.toLowerCase();
    if (KEY_MAPPINGS[lowerKey]) {
      return {
        ...KEY_MAPPINGS[lowerKey],
        modifiers,
        text: KEY_MAPPINGS[lowerKey].text || undefined
      };
    }

    // For single character keys
    if (key.length === 1) {
      const keyCode = key.toUpperCase().charCodeAt(0);
      return {
        key: key,
        code: 'Key' + key.toUpperCase(),
        keyCode: keyCode,
        modifiers,
        text: modifiers === 0 ? key : undefined // Only send text for unmodified keys
      };
    }

    // For other keys, try to generate a reasonable code
    return {
      key: key,
      code: key,
      keyCode: 0, // Unknown keycode
      modifiers
    };
  }

  // Hover over element
  async hover(params) {
    const { selector, xpath } = this.validateSelectorOrXPath(params, 'hover');

    const tabId = chrome.devtools.inspectedWindow.tabId;

    return new Promise(async (resolve, reject) => {
      let debuggerAttached = false;

      try {
        // First, get element coordinates
        let coords;
        try {
          coords = await window.MessagePassing.executeInPage('scrollAndGetElementPosition', { selector, xpath });
        } catch (error) {
          throw new Error(`Failed to get element position: ${error.message}`);
        }

        // Check if element was not found or not visible
        if (coords.error) {
          // Return success with appropriate error status
          try {
            const responseData = {
              selector: coords.selector,
              hovered: false,
              error: {
                code: coords.code,
                message: coords.message || (coords.code === 'ELEMENT_NOT_FOUND' ? 'Element not found' : 'Element is not visible')
              }
            };

            // Include element info if available (for visibility errors)
            if (coords.elementInfo) {
              responseData.elementInfo = coords.elementInfo;
            }

            const result = await this.getTabInfoWithCommand(responseData);
            resolve(result);
          } catch (err) {
            reject(err);
          }
          return;
        }

        // Create visual cursor
        await window.MessagePassing.executeInPage('showCursor', {});

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
          await window.MessagePassing.executeInPage('moveCursor', { x: currentX, y: currentY });

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
          window.MessagePassing.executeInPage('hideCursor', {});
        }, 1000);

        // Detach debugger
        await chrome.debugger.detach({ tabId });
        debuggerAttached = false;

        // Get current URL and title
        try {
          const result = await this.getTabInfoWithCommand({
            selector: coords.selector,
            position: { x: coords.x, y: coords.y },
            hovered: true
          });
          resolve(result);
        } catch (err) {
          reject(err);
        }
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

    return new Promise(async (resolve, reject) => {
      // Wrap the user's code to capture and serialize the result
      const wrappedCode = `
        (function() {
          // Inline helper functions
          const getUniqueSelector = function(element) {
            if (!element || !(element instanceof Element)) return null;
            
            // Special handling for html, head, and body elements - their tagName is unique
            const tagName = element.tagName.toLowerCase();
            if (tagName === 'html' || tagName === 'head' || tagName === 'body') {
              return tagName;
            }
            
            if (element.id && /^[a-zA-Z][\\w-]*$/.test(element.id)) {
              if (document.querySelectorAll('#' + CSS.escape(element.id)).length === 1) {
                return '#' + CSS.escape(element.id);
              }
            }
            const path = [];
            let current = element;
            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let selector = current.tagName.toLowerCase();
              if (current.classList.length > 0) {
                const classes = Array.from(current.classList)
                  .filter(c => /^[a-zA-Z][\\w-]*$/.test(c))
                  .slice(0, 3);
                if (classes.length > 0) {
                  selector += '.' + classes.join('.');
                }
              }
              if (current.parentElement) {
                const siblings = Array.from(current.parentElement.children);
                const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);
                if (sameTagSiblings.length > 1) {
                  const index = sameTagSiblings.indexOf(current) + 1;
                  selector += ':nth-of-type(' + index + ')';
                }
              }
              path.unshift(selector);
              const currentPath = path.join(' > ');
              if (document.querySelectorAll(currentPath).length === 1) {
                return currentPath;
              }
              current = current.parentElement;
            }
            return path.join(' > ');
          };

          const serializeValue = function(value, depth = 0, maxDepth = 3, seen = new WeakSet()) {
            if (value === null || value === undefined) return value;
            if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
              return value;
            }
            if (typeof value === 'function') {
              return '[Function: ' + (value.name || 'anonymous') + ']';
            }
            if (typeof value === 'symbol') {
              return value.toString();
            }
            if (value instanceof Date) {
              return value.toISOString();
            }
            if (value instanceof RegExp) {
              return value.toString();
            }
            if (value instanceof Error) {
              return {
                name: value.name,
                message: value.message,
                stack: value.stack
              };
            }
            if (value instanceof Element) {
              const selector = getUniqueSelector(value);
              return {
                nodeType: 'ELEMENT_NODE',
                selector: selector,
                tagName: value.tagName,
                id: value.id || undefined,
                className: value.className || undefined,
                attributes: Array.from(value.attributes).reduce((acc, attr) => {
                  acc[attr.name] = attr.value;
                  return acc;
                }, {})
              };
            }
            if (depth >= maxDepth) {
              return '[Max depth reached]';
            }
            if (typeof value === 'object' && seen.has(value)) {
              return '[Circular reference]';
            }
            if (typeof value === 'object') {
              seen.add(value);
            }
            if (Array.isArray(value)) {
              return value.map(item => serializeValue(item, depth + 1, maxDepth, seen));
            }
            if (value instanceof NodeList || value instanceof HTMLCollection) {
              return {
                nodeType: value instanceof NodeList ? 'NodeList' : 'HTMLCollection',
                length: value.length,
                items: Array.from(value).map(item => serializeValue(item, depth + 1, maxDepth, seen))
              };
            }
            if (ArrayBuffer.isView(value)) {
              return {
                type: value.constructor.name,
                length: value.length,
                data: '[Binary data]'
              };
            }
            if (typeof value === 'object') {
              const result = {};
              const keys = Object.keys(value);
              const maxKeys = 100;
              const limitedKeys = keys.slice(0, maxKeys);
              for (const key of limitedKeys) {
                try {
                  const serialized = serializeValue(value[key], depth + 1, maxDepth, seen);
                  if (serialized !== undefined && serialized !== null) {
                    result[key] = serialized;
                  }
                } catch (e) {
                  result[key] = '[Error accessing property]';
                }
              }
              if (keys.length > maxKeys) {
                result['...'] = keys.length - maxKeys + ' more properties';
              }
              return result;
            }
            return String(value);
          };

          try {
            let result;
            try {
              // First try to evaluate the code as-is
              result = eval(${JSON.stringify(code)});
            } catch (error) {
              // If it's an illegal return statement, wrap in a function
              if (error.message && error.message.includes('Illegal return statement')) {
                result = (function() { ${code} }).call(this);
              } else {
                // Re-throw other errors
                throw error;
              }
            }
            
            return { 
              success: true, 
              value: serializeValue(result)
            };
          } catch (error) {
            return { 
              success: false, 
              error: {
                name: error.name,
                message: error.message,
                stack: error.stack
              }
            };
          }
        })()
      `;

      chrome.devtools.inspectedWindow.eval(
        wrappedCode,
        async (result, error) => {
          if (error) {
            reject(new Error(`Evaluate failed: ${error.toString()}`));
          } else if (result && !result.success) {
            // Script threw an error
            reject(new Error(`${result.error.name}: ${result.error.message}`));
          } else {
            try {
              // Get current tab info and merge with result
              const finalResult = await this.getTabInfoWithCommand({
                value: result ? result.value : undefined
              });
              resolve(finalResult);
            } catch (err) {
              reject(err);
            }
          }
        }
      );
    });
  }

  // Get DOM outerHTML
  async getDom(params) {
    // Validate selector/xpath if provided
    let selector = params.selector;
    let xpath = params.xpath;
    if (selector || xpath) {
      ({ selector, xpath } = this.validateSelectorOrXPath(params, 'dom'));
    }

    try {
      const result = await window.MessagePassing.executeInPage('getOuterHTML', { selector: selector || '', xpath: xpath || '' });
      return await this.getTabInfoWithCommand(result);
    } catch (error) {
      throw new Error(`Get DOM failed: ${error.message}`);
    }
  }

  // Get elements from a specific point
  async getElementsFromPoint(params) {
    const { x, y } = params;

    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new Error('Both x and y coordinates are required and must be numbers');
    }

    try {
      // Execute elementsFromPoint in the page context
      const result = await window.MessagePassing.executeInPage('getElementsFromPoint', { x, y });
      return await this.getTabInfoWithCommand(result);
    } catch (error) {
      throw new Error(`Get elements from point failed: ${error.message}`);
    }
  }

  // Query all elements matching a CSS selector or XPath
  async querySelectorAll(params) {
    const { selector, xpath } = this.validateSelectorOrXPath(params, 'querySelectorAll');

    try {
      // Execute querySelectorAll in the page context
      const result = await window.MessagePassing.executeInPage('querySelectorAll', { selector, xpath });
      return await this.getTabInfoWithCommand(result);
    } catch (error) {
      throw new Error(`Query selector all failed: ${error.message}`);
    }
  }

  // Get console logs from panel storage
  async getLogs(params) {
    const { before, limit = 100, level } = params;

    // Access the panel's consoleLogs array directly
    let logs = window.consoleLogs || [];
    let filteredLogs = logs;

    // If 'before' timestamp is provided, filter logs older than that timestamp
    if (before) {
      filteredLogs = filteredLogs.filter(log => log.timestamp < before);
    }

    // If level is provided, filter by log level
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    // If limit is 0, just return the count
    if (limit === 0) {
      return {
        logs: [],
        total: logs.length,
        filteredTotal: filteredLogs.length
      };
    }

    // Get the most recent logs up to the limit (newest first)
    const actualLimit = limit || 100;
    const startIndex = Math.max(0, filteredLogs.length - actualLimit);
    const resultLogs = filteredLogs.slice(startIndex).reverse();

    return {
      logs: resultLogs,
      total: logs.length,
      filteredTotal: filteredLogs.length
    };
  }
}

// Export for use in panel.js
window.CommandExecutor = CommandExecutor;
