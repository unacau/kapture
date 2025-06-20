// Kapture Content Script
// Handles message passing between DevTools panel and page content

// Check if we've already set up the console listener
if (!window.__kaptureConsoleListenerSetup) {
  window.__kaptureConsoleListenerSetup = true;

  // Listen for console events from the page and forward to background
  window.addEventListener('kapture-console', (event) => {
  if (event.detail) {
    // Handle console.clear separately
    if (event.detail.level === 'clear') {
      try {
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            type: 'kapture-console-clear'
          });
        }
      } catch (e) {
        // Extension context may have been invalidated
      }
    } else if (event.detail.args) {
      const entry = {
        timestamp: event.detail.timestamp || new Date().toISOString(),
        level: event.detail.level,
        message: event.detail.args.join(' ')
      };

      // Send real-time console log update to background script
      try {
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            type: 'kapture-console-log',
            logEntry: entry
          });
        }
      } catch (e) {
        // Extension context may have been invalidated
      }
    }
  }
  });
}

(function() {
  // Check if already injected
  if (window.__kaptureContentScript) return;

  // Counter for generating unique IDs
  let kaptureIdCounter = 0;

  // Helper functions
  const helpers = {
    // Comprehensive element visibility check
    isElementVisible: function(element, rect, computedStyle) {
      // If rect and computedStyle not provided, calculate them
      if (!rect) rect = element.getBoundingClientRect();
      if (!computedStyle) computedStyle = window.getComputedStyle(element);

      // Check if element has dimensions
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }

      // Check CSS visibility properties
      if (computedStyle.display === 'none' || 
          computedStyle.visibility === 'hidden' || 
          computedStyle.opacity === '0') {
        return false;
      }

      // Check if element is in viewport
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      // Check if any part of the element is within the viewport
      const inViewport = rect.bottom > 0 && 
                        rect.right > 0 && 
                        rect.top < viewportHeight && 
                        rect.left < viewportWidth;

      if (!inViewport) {
        return false;
      }

      // Check if element is hidden by ancestor's properties
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.display === 'none' || 
            parentStyle.visibility === 'hidden' || 
            parentStyle.opacity === '0') {
          return false;
        }

        // Check for overflow hidden that might hide the element
        if (parentStyle.overflow === 'hidden' || 
            parentStyle.overflowX === 'hidden' || 
            parentStyle.overflowY === 'hidden') {
          const parentRect = parent.getBoundingClientRect();
          // Check if element is outside parent's visible area
          if (rect.bottom < parentRect.top || 
              rect.top > parentRect.bottom || 
              rect.right < parentRect.left || 
              rect.left > parentRect.right) {
            return false;
          }
        }

        parent = parent.parentElement;
      }

      // Check if element is covered by another element
      // Get element's center point
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Check what element is at the center point
      const elementAtPoint = document.elementFromPoint(centerX, centerY);

      // If elementAtPoint is null, the point is outside viewport
      if (!elementAtPoint) {
        return false;
      }

      // Check if the element at point is our element or a descendant
      if (elementAtPoint === element || element.contains(elementAtPoint)) {
        return true;
      }

      // Check if the element at point is an ancestor (element might be transparent)
      if (elementAtPoint.contains(element)) {
        return true;
      }

      // Element might be partially covered, check multiple points
      const points = [
        { x: rect.left + rect.width * 0.1, y: rect.top + rect.height * 0.1 },
        { x: rect.right - rect.width * 0.1, y: rect.top + rect.height * 0.1 },
        { x: rect.left + rect.width * 0.1, y: rect.bottom - rect.height * 0.1 },
        { x: rect.right - rect.width * 0.1, y: rect.bottom - rect.height * 0.1 }
      ];

      // Check if any of the points hit our element
      for (const point of points) {
        const el = document.elementFromPoint(point.x, point.y);
        if (el === element || element.contains(el) || (el && el.contains(element))) {
          return true;
        }
      }

      // Element is completely covered
      return false;
    },

    // Find element by selector or XPath
    findElement: function(selector, xpath) {
      // Selector takes precedence if both are provided
      if (selector) {
        return document.querySelector(selector);
      } else if (xpath) {
        try {
          const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          return result.singleNodeValue;
        } catch (e) {
          // Invalid XPath expression
          return null;
        }
      }
      return null;
    },
    
    // Find all elements by selector or XPath
    findAllElements: function(selector, xpath) {
      if (selector) {
        return Array.from(document.querySelectorAll(selector));
      } else if (xpath) {
        try {
          const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          const elements = [];
          for (let i = 0; i < result.snapshotLength; i++) {
            elements.push(result.snapshotItem(i));
          }
          return elements;
        } catch (e) {
          // Invalid XPath expression
          return [];
        }
      }
      return [];
    },
    // Standardized element data extraction
    getElementData: function(element, index = 0) {
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);

      // Get the selector (which may add an ID to the element)
      const selector = this.getUniqueSelector(element);

      // Comprehensive visibility check
      const visible = this.isElementVisible(element, rect, computedStyle);

      const data = {
        index: index,
        tagName: element.tagName.toLowerCase(),
        id: element.id || null,
        className: element.className || null,
        // classList: element.classList ? Array.from(element.classList) : [],
        selector: selector,
        // text: element.textContent ? element.textContent.trim().substring(0, 100) : '',
        // alt: element.alt || null,
        type: element.type || null,
        // dataAttributes: Object.fromEntries(
        //   Array.from(element.attributes)
        //     .filter(attr => attr.name.startsWith('data-'))
        //     .map(attr => [attr.name, attr.value])
        // ),
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          // top: Math.round(rect.top),
          // right: Math.round(rect.right),
          // bottom: Math.round(rect.bottom),
          // left: Math.round(rect.left)
        },
        // style: {
        //   display: computedStyle.display,
        //   visibility: computedStyle.visibility,
        //   opacity: computedStyle.opacity,
        //   zIndex: computedStyle.zIndex,
        //   position: computedStyle.position,
        //   pointerEvents: computedStyle.pointerEvents
        // },
        visible: visible
      };
      // Conditionally add attributes
      ["href", "src", "value", "name"].forEach(attr => {
        if (element[attr]) {
          data[attr] = element[attr];
        }
      });


      // If it's a select element, add the options
      if (element.tagName.toLowerCase() === 'select') {
        data.options = Array.from(element.options).map((option, optionIndex) => ({
          index: optionIndex,
          value: option.value,
          text: option.text,
          selected: option.selected,
          disabled: option.disabled
        }));
      }

      return data;
    },
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
    getElementInfo: function(selector, xpath) {
      const element = this.findElement(selector, xpath);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined
        };
      }

      // Use the standardized element data extraction
      return helpers.getElementData(element);
    },

    scrollAndGetElementPosition: function(selector, xpath) {
      const element = this.findElement(selector, xpath);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector,
          xpath: xpath
        };
      }

      // Check if element is visible before scrolling
      const computedStyle = window.getComputedStyle(element);
      let rect = element.getBoundingClientRect();
      const visibleBeforeScroll = this.isElementVisible(element, rect, computedStyle);

      // Scroll element into view if needed
      element.scrollIntoViewIfNeeded ? element.scrollIntoViewIfNeeded() : element.scrollIntoView({ block: 'center' });

      // Get element position after scrolling
      rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      // Check visibility again after scrolling
      const visible = this.isElementVisible(element, rect, computedStyle);

      // Get the unique selector (which may add an ID)
      const uniqueSelector = this.getUniqueSelector(element);
      
      // If element is not visible, return error with element info
      if (!visible) {
        // Get full element data
        const elementData = this.getElementData(element);
        
        return {
          error: true,
          code: 'ELEMENT_NOT_VISIBLE',
          selector: uniqueSelector,
          message: 'Element is not visible and cannot be interacted with',
          elementInfo: elementData
        };
      }
      
      return {
        x: x,
        y: y,
        selector: uniqueSelector,
        visible: visible
      };
    },

    getElementBounds: function(selector, xpath) {
      const element = this.findElement(selector, xpath);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined
        };
      }
      const rect = element.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      // Get the unique selector (which may add an ID)
      const uniqueSelector = this.getUniqueSelector(element);
      return {
        x: Math.round(rect.left + scrollX),
        y: Math.round(rect.top + scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        devicePixelRatio: window.devicePixelRatio || 1,
        selector: uniqueSelector
      };
    },

    // Form operations
    fillElement: function(selector, xpath, value) {
      const element = this.findElement(selector, xpath);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined
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
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined
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

      // Get the unique selector (which may add an ID)
      const uniqueSelector = this.getUniqueSelector(element);
      
      return {
        selector: uniqueSelector,
        value: element.value || element.textContent,
        filled: true
      };
    },

    selectOption: function(selector, xpath, value) {
      const element = this.findElement(selector, xpath);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined
        };
      }

      if (element.tagName !== 'SELECT') {
        return {
          error: true,
          code: 'INVALID_ELEMENT',
          message: 'Element is not a select: ' + element.tagName,
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined
        };
      }

      // Get all available options
      const options = Array.from(element.options).map((opt, index) => ({
        index: index,
        value: opt.value,
        text: opt.text,
        selected: opt.selected,
        disabled: opt.disabled
      }));

      // Find option by value
      const option = Array.from(element.options).find(opt => opt.value === value);
      if (!option) {
        return {
          error: true,
          code: 'OPTION_NOT_FOUND',
          message: 'Option not found with value: ' + value,
          selector: selector,
          options: options
        };
      }

      // Select the option
      element.value = value;
      option.selected = true;

      // Trigger change event
      element.dispatchEvent(new Event('change', { bubbles: true }));

      // Get the unique selector (which may add an ID)
      const uniqueSelector = this.getUniqueSelector(element);
      
      return {
        selector: uniqueSelector,
        value: value,
        selectedText: option.text,
        selected: true,
        options: options
      };
    },

    // Generate unique CSS selector for an element
    getUniqueSelector: function(element) {
      if (!element || !(element instanceof Element)) return null;

      // Special handling for html, head, and body elements - their tagName is unique
      const tagName = element.tagName.toLowerCase();
      if (tagName === 'html' || tagName === 'head' || tagName === 'body') {
        return tagName;
      }

      // If element has an ID, use it (unless it's empty or contains special chars)
      if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
        // Check if ID is truly unique
        if (document.querySelectorAll('#' + CSS.escape(element.id)).length === 1) {
          return '#' + CSS.escape(element.id);
        }
      }

      // If element doesn't have an ID, add a unique kapture ID
      if (!element.id) {
        element.id = 'kapture-' + (++kaptureIdCounter);
        return '#' + element.id;
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
    getOuterHTML: function(selector, xpath) {
      if (!selector && !xpath) {
        return {
          found: true,
          html: document.body.outerHTML
        };
      }

      const element = this.findElement(selector, xpath);
      if (!element) {
        return {
          found: false,
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined,
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

    // Get elements from a specific point
    getElementsFromPoint: function(x, y) {
      try {
        // Get all elements at the specified coordinates
        const elements = document.elementsFromPoint(x, y);

        if (!elements || elements.length === 0) {
          return {
            found: false,
            x: x,
            y: y,
            elements: []
          };
        }

        // Map elements to return data
        const elementData = elements.map((element, index) => {
          return helpers.getElementData(element, index);
        });

        return {
          found: true,
          x: x,
          y: y,
          elements: elementData
        };
      } catch (error) {
        return {
          found: false,
          x: x,
          y: y,
          error: {
            code: 'EXECUTION_ERROR',
            message: error.message
          }
        };
      }
    },

    // Get all elements matching a CSS selector or XPath
    querySelectorAll: function(selector, xpath) {
      try {
        const elements = this.findAllElements(selector, xpath);

        if (!elements || elements.length === 0) {
          return {
            found: false,
            selector: selector || undefined,
            xpath: !selector ? xpath : undefined,
            elements: []
          };
        }

        // Map elements to return data using the standardized helper
        const elementData = Array.from(elements).map((element, index) => {
          return helpers.getElementData(element, index);
        });

        return {
          found: true,
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined,
          count: elementData.length,
          elements: elementData
        };
      } catch (error) {
        return {
          found: false,
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined,
          error: {
            code: selector ? 'INVALID_SELECTOR' : 'INVALID_XPATH',
            message: error.message
          }
        };
      }
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
        }
      };
    },


    // Focus an element
    focusElement: function(selector, xpath) {
      const element = this.findElement(selector, xpath);
      if (!element) {
        return {
          error: true,
          code: 'ELEMENT_NOT_FOUND',
          selector: selector || undefined,
          xpath: !selector ? xpath : undefined
        };
      }

      // Focus the element if it's focusable
      if (typeof element.focus === 'function') {
        element.focus();
      }

      // Get the unique selector (which may add an ID)
      const uniqueSelector = this.getUniqueSelector(element);
      
      return {
        focused: true,
        selector: uniqueSelector
      };
    }
  };

  // Command execution handler
  function executeCommand(command, params) {
    switch (command) {
      // Navigation commands
      case 'navigate':
        if (!params.url) throw new Error('URL parameter required');
        window.location.href = params.url;
        return { navigated: true, url: params.url };

      case 'goBack':
        window.history.back();
        return { action: 'back' };

      case 'goForward':
        window.history.forward();
        return { action: 'forward' };

      case 'reload':
        window.location.reload();
        return { action: 'reload' };

      // Tab info operations
      case 'getTabInfo':
        return helpers.getTabInfo();

      // DOM queries
      case 'querySelector':
        if (!params.selector && !params.xpath) throw new Error('Selector or XPath parameter required');
        const elements = helpers.findAllElements(params.selector, params.xpath);
        return {
          found: elements.length > 0,
          count: elements.length,
          selector: params.selector || undefined,
          xpath: !params.selector ? params.xpath : undefined
        };

      case 'getElementInfo':
        if (!params.selector && !params.xpath) throw new Error('Selector or XPath parameter required');
        return helpers.getElementInfo(params.selector, params.xpath);

      case 'getElementBounds':
        if (!params.selector && !params.xpath) throw new Error('Selector or XPath parameter required');
        return helpers.getElementBounds(params.selector, params.xpath);

      case 'getOuterHTML':
        return helpers.getOuterHTML(params.selector, params.xpath);

      case 'getElementsFromPoint':
        if (typeof params.x !== 'number' || typeof params.y !== 'number') {
          throw new Error('Both x and y coordinates are required');
        }
        return helpers.getElementsFromPoint(params.x, params.y);

      case 'querySelectorAll':
        if (!params.selector && !params.xpath) throw new Error('Selector or XPath parameter required');
        return helpers.querySelectorAll(params.selector, params.xpath);

      case 'scrollAndGetElementPosition':
        if (!params.selector && !params.xpath) throw new Error('Selector or XPath parameter required');
        return helpers.scrollAndGetElementPosition(params.selector, params.xpath);

      // Element interactions
      case 'click':
        if (!params.selector && !params.xpath) throw new Error('Selector or XPath parameter required');
        const clickElement = helpers.findElement(params.selector, params.xpath);
        if (!clickElement) {
          return {
            error: true,
            code: 'ELEMENT_NOT_FOUND',
            selector: params.selector || undefined,
            xpath: !params.selector ? params.xpath : undefined
          };
        }
        // Get the unique selector (which may add an ID)
        const clickSelector = helpers.getUniqueSelector(clickElement);
        clickElement.click();
        return {
          clicked: true,
          selector: clickSelector
        };

      case 'hover':
        if (!params.selector && !params.xpath) throw new Error('Selector or XPath parameter required');
        const hoverElement = helpers.findElement(params.selector, params.xpath);
        if (!hoverElement) {
          return {
            error: true,
            code: 'ELEMENT_NOT_FOUND',
            selector: params.selector || undefined,
            xpath: !params.selector ? params.xpath : undefined
          };
        }
        // Get the unique selector (which may add an ID)
        const hoverSelector = helpers.getUniqueSelector(hoverElement);
        hoverElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        hoverElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        return {
          hovered: true,
          selector: hoverSelector
        };

      case 'fill':
        if ((!params.selector && !params.xpath) || params.value === undefined) {
          throw new Error('Selector/XPath and value parameters required');
        }
        return helpers.fillElement(params.selector, params.xpath, params.value);

      case 'select':
        if ((!params.selector && !params.xpath) || !params.value) {
          throw new Error('Selector/XPath and value parameters required');
        }
        return helpers.selectOption(params.selector, params.xpath, params.value);

      case 'focusElement':
        if (!params.selector && !params.xpath) {
          throw new Error('Selector or XPath parameter required');
        }
        return helpers.focusElement(params.selector, params.xpath);

      // Mouse cursor operations
      case 'showCursor':
        return { shown: helpers.createCursor() };

      case 'moveCursor':
        if (params.x === undefined || params.y === undefined) {
          throw new Error('X and Y coordinates required');
        }
        helpers.moveCursor(params.x, params.y);
        return { moved: true, x: params.x, y: params.y };

      case 'pulseCursor':
        helpers.pulseCursor();
        return { pulsed: true };

      case 'hideCursor':
        helpers.removeCursor();
        return { hidden: true };

      // Console operations
      case 'getLogs':
        const { before, limit = 100, level } = params;
        return helpers.getLogs(before, limit, level);

      case 'clearLogs':
        window.__kaptureLogs = [];
        return { cleared: true };

      case 'testLog':
        // Create a test log entry using the overridden console.log
        console.log('Test log from Kapture at', new Date().toISOString());
        return {
          logged: true,
          logsCount: window.__kaptureLogs ? window.__kaptureLogs.length : 0
        };


      // Scroll operations
      case 'scrollTo':
        if (params.selector || params.xpath) {
          const element = helpers.findElement(params.selector, params.xpath);
          if (!element) {
            return {
              error: true,
              code: 'ELEMENT_NOT_FOUND',
              selector: params.selector || undefined,
              xpath: !params.selector ? params.xpath : undefined
            };
          }
          // Get the unique selector (which may add an ID)
          const scrollSelector = helpers.getUniqueSelector(element);
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return { scrolled: true, selector: scrollSelector };
        } else if (params.x !== undefined && params.y !== undefined) {
          window.scrollTo(params.x, params.y);
          return { scrolled: true };
        } else {
          throw new Error('Either selector/xpath or x/y coordinates required');
        }

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  // Message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Only handle kapture commands
    if (request.type !== 'kapture-command') return;

    // Note: Tab ID verification happens in the background script
    // Content scripts don't have access to their own tab ID directly

    try {
      const result = executeCommand(request.command, request.params || {});
      sendResponse({
        type: 'kapture-response',
        requestId: request.requestId,
        success: true,
        result: result
      });
    } catch (error) {
      sendResponse({
        type: 'kapture-response',
        requestId: request.requestId,
        success: false,
        error: {
          message: error.message,
          code: error.code || 'EXECUTION_ERROR'
        }
      });
    }

    return true; // Will respond asynchronously
  });

  // Mark as injected
  window.__kaptureContentScript = true;

  // Notify that content script is ready
  // Note: chrome.devtools is not available in content scripts
  chrome.runtime.sendMessage({
    type: 'kapture-content-script-ready'
  });

  // Real-time tab info monitoring
  let scrollDebounceTimer = null;
  let resizeDebounceTimer = null;
  let lastSentTabInfo = null;

  // Helper to check if tab info has changed
  function hasTabInfoChanged(newInfo, oldInfo) {
    if (!oldInfo) return true;
    return JSON.stringify(newInfo) !== JSON.stringify(oldInfo);
  }

  // Send tab info update to background script
  function sendTabInfoUpdate() {
    const tabInfo = helpers.getTabInfo();
    if (hasTabInfoChanged(tabInfo, lastSentTabInfo)) {
      lastSentTabInfo = tabInfo;
      try {
        // Use runtime.sendMessage to ensure it works in content scripts
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            type: 'kapture-tab-info-update',
            tabInfo: tabInfo
          });
        }
      }
      catch(e) {
        // ignore
      }
    }
  }

  // Debounced scroll handler (wait for scroll to settle)
  function handleScroll() {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = setTimeout(() => {
      sendTabInfoUpdate();
    }, 300); // Send update 300ms after scrolling stops
  }

  // Debounced resize handler
  function handleResize() {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
      sendTabInfoUpdate();
    }, 500); // Send update 500ms after resizing stops
  }

  // Listen for scroll events
  window.addEventListener('scroll', handleScroll, { passive: true });

  // Listen for resize events
  window.addEventListener('resize', handleResize);

  // Listen for visibility changes (immediate)
  document.addEventListener('visibilitychange', () => {
    sendTabInfoUpdate();
  });

  // Listen for title changes (immediate)
  const titleObserver = new MutationObserver(() => {
    sendTabInfoUpdate();
  });
  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true
    });
  } else {
    // If no title element exists yet, watch for it
    const headObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeName === 'TITLE') {
            titleObserver.observe(node, {
              childList: true,
              characterData: true,
              subtree: true
            });
            headObserver.disconnect();
            break;
          }
        }
      }
    });
    const head = document.querySelector('head');
    if (head) {
      headObserver.observe(head, { childList: true });
    }
  }

  // Listen for history changes (immediate)
  window.addEventListener('popstate', () => {
    sendTabInfoUpdate();
  });

  // Override pushState and replaceState to catch programmatic navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function() {
    originalPushState.apply(history, arguments);
    setTimeout(sendTabInfoUpdate, 0); // Allow URL to update
  };

  history.replaceState = function() {
    originalReplaceState.apply(history, arguments);
    setTimeout(sendTabInfoUpdate, 0); // Allow URL to update
  };

  // Send initial tab info
  sendTabInfoUpdate();
})();
