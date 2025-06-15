// Page Helper Functions for Kapture
// These functions are injected into the page once to avoid repeated eval calls

(function() {
  // Prevent multiple injections
  if (window.__kaptureHelpers) return;

  const nodeTypes = {
    1: "ELEMENT_NODE",
    2: "ATTRIBUTE_NODE",
    3: "TEXT_NODE",
    4: "CDATA_SECTION_NODE",
    5: "ENTITY_REFERENCE_NODE",
    6: "ENTITY_NODE",
    7: "PROCESSING_INSTRUCTION_NODE",
    8: "COMMENT_NODE",
    9: "DOCUMENT_NODE",
    10: "DOCUMENT_TYPE_NODE",
    11: "DOCUMENT_FRAGMENT_NODE",
    12: "NOTATION_NODE"
  };

  // Create short aliases for frequently used functions to minimize eval payload
  window.__kh = window.__kaptureHelpers = {
    // Mouse cursor management
    createCursor: function() {
      const existingCursor = document.getElementById('kapture-mouse-cursor');
      if (existingCursor) existingCursor.remove();

      const cursor = document.createElement('div');
      cursor.id = 'kapture-mouse-cursor';
      cursor.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="40" height="40" viewBox="0 0 30 30">
            <path d="M 9 3 A 1 1 0 0 0 8 4 L 8 21 A 1 1 0 0 0 9 22 A 1 1 0 0 0 9.796875 21.601562 L 12.919922 18.119141 L 16.382812 26.117188 C 16.701812 26.855187 17.566828 27.188469 18.298828 26.855469 C 19.020828 26.527469 19.340672 25.678078 19.013672 24.955078 L 15.439453 17.039062 L 21 17 A 1 1 0 0 0 22 16 A 1 1 0 0 0 21.628906 15.222656 L 9.7832031 3.3789062 A 1 1 0 0 0 9 3 z"></path>
        </svg>
      `;
      cursor.style.cssText = `
        position: fixed;
        width: 20px;
        height: 20px;
        pointer-events: none;
        z-index: 999999;
        transform: translate(0, 0);
        transition: none;
      `;
      document.body.appendChild(cursor);
      return true;
    },

    moveCursor: function(x, y) {
      const cursor = document.getElementById('kapture-mouse-cursor');
      if (cursor) {
        cursor.style.left = x + 'px';
        cursor.style.top = y + 'px';
      }
    },

    pulseCursor: function() {
      const cursor = document.getElementById('kapture-mouse-cursor');
      if (cursor) {
        cursor.style.transform = 'scale(0.8)';
        setTimeout(() => {
          cursor.style.transform = 'scale(1)';
        }, 100);
      }
    },

    removeCursor: function() {
      const cursor = document.getElementById('kapture-mouse-cursor');
      if (cursor) cursor.remove();
    },

    // Element operations
    getElementInfo: function(selector) {
      const element = document.querySelector(selector);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector
        };
      }

      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      return {
        x: x,
        y: y,
        selector: selector,
        tagName: element.tagName,
        text: element.textContent?.trim().substring(0, 100) || ''
      };
    },

    scrollAndGetElementPosition: function(selector) {
      const element = document.querySelector(selector);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector
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
        selector: selector,
        tagName: element.tagName
      };
    },

    getElementBounds: function(selector) {
      const element = document.querySelector(selector);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector
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
    },

    // Form operations
    fillElement: function(selector, value) {
      const element = document.querySelector(selector);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector
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
          selector: selector
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
        element.value = value;
      } else if (element.isContentEditable) {
        element.textContent = value;
      }

      // Trigger input and change events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));

      // Blur to trigger any blur handlers
      element.blur();

      return {
        selector: selector,
        tagName: element.tagName,
        value: element.value || element.textContent,
        filled: true
      };
    },

    selectOption: function(selector, value) {
      const element = document.querySelector(selector);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector
        };
      }

      if (element.tagName !== 'SELECT') {
        return {
          error: true,
          code: 'INVALID_ELEMENT',
          message: 'Element is not a select: ' + element.tagName,
          selector: selector
        };
      }

      // Find option by value
      const option = Array.from(element.options).find(opt => opt.value === value);
      if (!option) {
        return {
          error: true,
          code: 'OPTION_NOT_FOUND',
          message: 'Option not found with value: ' + value,
          selector: selector
        };
      }

      // Select the option
      element.value = value;
      option.selected = true;

      // Trigger change event
      element.dispatchEvent(new Event('change', { bubbles: true }));

      return {
        selector: selector,
        value: value,
        selectedText: option.text,
        selected: true
      };
    },

    // Generate unique CSS selector for an element
    getUniqueSelector: function(element) {
      if (!element || !(element instanceof Element)) return null;

      // If element has an ID, use it (unless it's empty or contains special chars)
      if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
        // Check if ID is truly unique
        if (document.querySelectorAll('#' + CSS.escape(element.id)).length === 1) {
          return '#' + CSS.escape(element.id);
        }
      }

      // Build path from element to root
      const path = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.tagName.toLowerCase();

        // Add classes if available (but not too many)
        if (current.classList.length > 0) {
          const classes = Array.from(current.classList)
            .filter(c => /^[a-zA-Z][\w-]*$/.test(c))
            .slice(0, 3);
          if (classes.length > 0) {
            selector += '.' + classes.join('.');
          }
        }

        // Add nth-child if needed for uniqueness
        if (current.parentElement) {
          const siblings = Array.from(current.parentElement.children);
          const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);

          if (sameTagSiblings.length > 1) {
            const index = sameTagSiblings.indexOf(current) + 1;
            selector += ':nth-of-type(' + index + ')';
          }
        }

        path.unshift(selector);

        // Stop if we've built a unique selector
        const currentPath = path.join(' > ');
        if (document.querySelectorAll(currentPath).length === 1) {
          return currentPath;
        }

        current = current.parentElement;
      }

      return path.join(' > ');
    },

    // DOM operations
    getOuterHTML: function(selector) {
      if (!selector) {
        return {
          found: true,
          html: document.body.outerHTML
        };
      }

      const element = document.querySelector(selector);
      if (!element) {
        return {
          found: false,
          selector: selector,
          error: {
            code: 'ELEMENT_NOT_FOUND',
            message: 'Element not found'
          }
        };
      }

      return {
        found: true,
        html: element.outerHTML
      };
    },

    // Console log capture
    getLogs: function(max) {
      if (!window.__kaptureLogs) return [];
      return window.__kaptureLogs.slice(-max).reverse();
    },

    // Safe serialization helper for evaluate results
    serializeValue: function(value, depth = 0, maxDepth = 3, seen = new WeakSet()) {
      // Handle primitive types
      if (value === null || value === undefined) return value;
      if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        return value;
      }

      // Handle functions
      if (typeof value === 'function') {
        return '[Function: ' + (value.name || 'anonymous') + ']';
      }

      // Handle symbols
      if (typeof value === 'symbol') {
        return value.toString();
      }

      // Handle dates
      if (value instanceof Date) {
        return value.toISOString();
      }

      // Handle regex
      if (value instanceof RegExp) {
        return value.toString();
      }

      // Handle errors
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }

      // Handle DOM elements
      if (value instanceof Element) {
        const selector = this.getUniqueSelector(value);
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

      // Prevent infinite recursion
      if (depth >= maxDepth) {
        return '[Max depth reached]';
      }

      // Handle circular references
      if (typeof value === 'object' && seen.has(value)) {
        return '[Circular reference]';
      }

      // Mark object as seen
      if (typeof value === 'object') {
        seen.add(value);
      }

      // Handle arrays
      if (Array.isArray(value)) {
        return value.map(item => this.serializeValue(item, depth + 1, maxDepth, seen));
      }

      // Handle NodeList and HTMLCollection
      if (value instanceof NodeList || value instanceof HTMLCollection) {
        return {
          nodeType: value instanceof NodeList ? 'NodeList' : 'HTMLCollection',
          length: value.length,
          items: Array.from(value).map(item => this.serializeValue(item, depth + 1, maxDepth, seen))
        };
      }

      // Handle typed arrays
      if (ArrayBuffer.isView(value)) {
        return {
          type: value.constructor.name,
          length: value.length,
          data: '[Binary data]'
        };
      }

      // Handle other objects
      if (typeof value === 'object') {
        const result = {};
        const keys = Object.keys(value);

        // Limit number of keys to prevent huge objects
        const maxKeys = 100;
        const limitedKeys = keys.slice(0, maxKeys);

        for (const key of limitedKeys) {
          try {
            const serialized = this.serializeValue(value[key], depth + 1, maxDepth, seen);
            if (serialized === undefined || serialized === null) continue; // Skip undefined values
            result[key] = serialized;
          } catch (e) {
            result[key] = '[Error accessing property]';
          }
        }

        if (keys.length > maxKeys) {
          result['...'] = `${keys.length - maxKeys} more properties`;
        }

        return result;
      }

      // Fallback for unknown types
      return String(value);
    },

    // Get comprehensive tab information
    getTabInfo: function() {
      // Get navigation timing data
      const perfData = window.performance.timing;
      const loadTime = perfData.loadEventEnd > 0 ? 
        perfData.loadEventEnd - perfData.navigationStart : null;
      const domContentLoadedTime = perfData.domContentLoadedEventEnd > 0 ?
        perfData.domContentLoadedEventEnd - perfData.navigationStart : null;
      
      return {
        url: window.location.href,
        title: document.title,
        domSize: document.documentElement.outerHTML.length,
        fullPageDimensions: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight
        },
        viewportDimensions: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scrollPosition: {
          x: window.pageXOffset || document.documentElement.scrollLeft,
          y: window.pageYOffset || document.documentElement.scrollTop
        },
        pageVisibility: {
          visible: !document.hidden,
          visibilityState: document.visibilityState
        },
        pageLoadTimes: {
          domContentLoaded: domContentLoadedTime,
          load: loadTime,
          // Time to first byte
          ttfb: perfData.responseStart - perfData.navigationStart,
          // Total time including redirects
          total: perfData.loadEventEnd > 0 ? 
            perfData.loadEventEnd - perfData.fetchStart : null
        }
      };
    }
  };

  // Setup console log capture if not already done
  if (!window.__kaptureLogs) {
    window.__kaptureLogs = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    function captureLog(level, args) {
      const entry = {
        timestamp: new Date().toISOString(),
        level: level,
        message: Array.from(args).map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch (e) {
            return String(arg);
          }
        }).join(' ')
      };

      window.__kaptureLogs.push(entry);
      if (window.__kaptureLogs.length > 1000) {
        window.__kaptureLogs.shift();
      }
    }

    console.log = function(...args) {
      captureLog('log', args);
      originalLog.apply(console, args);
    };

    console.error = function(...args) {
      captureLog('error', args);
      originalError.apply(console, args);
    };

    console.warn = function(...args) {
      captureLog('warn', args);
      originalWarn.apply(console, args);
    };

    console.info = function(...args) {
      captureLog('info', args);
      originalInfo.apply(console, args);
    };
  }
})();
