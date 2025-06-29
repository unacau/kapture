// page-helpers.js - Content script that provides helper functions
let kaptureIdCounter = 0;

function getUniqueSelector(element) {
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

  const uniqueId = 'kapture-' + (++kaptureIdCounter)

  if (!element.id) {
    element.id = uniqueId;
    return '#' + uniqueId;
  }

  element.classList.add(uniqueId);
  return '.' + uniqueId
}
function findScrollableParent(element) {
  function isScrollable(element) {
    const hasScrollableContent = element.scrollHeight > element.clientHeight ||
      element.scrollWidth > element.clientWidth;

    if (!hasScrollableContent) return false;

    const style = getComputedStyle(element);
    return /(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX);
  }

  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    if (isScrollable(parent)) return parent;
    parent = parent.parentElement;
  }
  return document.documentElement;
}
function serializeValue(value, depth = 0, maxDepth = 3, seen = new WeakSet()) {
  // Handle primitive types
  if (value === null || value === undefined) return value;
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'function') return '[Function: ' + (value.name || 'anonymous') + ']';
  if (typeof value === 'symbol') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();

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
    return value.map(item => serializeValue(item, depth + 1, maxDepth, seen));
  }

  // Handle NodeList and HTMLCollection
  if (value instanceof NodeList || value instanceof HTMLCollection) {
    return {
      nodeType: value instanceof NodeList ? 'NodeList' : 'HTMLCollection',
      length: value.length,
      items: Array.from(value).map(item => serializeValue(item, depth + 1, maxDepth, seen))
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
}
function getTabInfo() {
  const de = document.documentElement;
  return {
    url: window.location.href,
    title: document.title,
    domSize: de.outerHTML.length,
    fullPageDimensions: { width: de.scrollWidth, height: de.scrollHeight },
    viewportDimensions: { width: window.innerWidth, height: window.innerHeight },
    scrollPosition: { x: window.pageXOffset || de.scrollLeft, y: window.pageYOffset || de.scrollTop },
    pageVisibility: { visible: !document.hidden, visibilityState: document.visibilityState }
  };
}
function findAllElements(selector, xpath) {
  if (selector) {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (e) {
      throw new Error(`Invalid selector: ${e.message}`);
    }
  }
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return Array.from({length: result.snapshotLength}, (_, i) => result.snapshotItem(i));
  }
  catch (e) {
    throw new Error(`Invalid XPath: ${e.message}`);
  }
}
function getElementData(element) {
  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);

  // Get the selector (which may add an ID to the element)
  const selector = getUniqueSelector(element);

  // Comprehensive visibility check
  const visible = isElementVisible(element, rect, computedStyle);

  const data = {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.className || undefined,
    selector: selector,
    bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    visible: visible,
    focused: element === document.activeElement
  };
  // Conditionally add attributes
  ["href", "src", "value", "name"].forEach(attr => element[attr] && (data[attr] = element[attr]));

  // If it's a select element, add the options
  if (data.tagName === 'select') {
    data.options = Array.from(element.options).map((option, optionIndex) => ({
      index: optionIndex,
      value: option.value,
      text: option.text,
      selected: option.selected,
      disabled: option.disabled
    }));
  }
  // Add scrollable parent if exists
  const scrollParent = findScrollableParent(element);
  data.scrollParent = getUniqueSelector(scrollParent);
  return data;
}
function isElementVisible(element, rect, computedStyle) {
  // If rect and computedStyle not provided, calculate them
  if (!rect) rect = element.getBoundingClientRect();
  if (!computedStyle) computedStyle = window.getComputedStyle(element);

  // Check if element has dimensions
  if (rect.width <= 0 || rect.height <= 0) return false;

  // Check CSS visibility properties
  if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || computedStyle.opacity === '0') {
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

  if (!inViewport) return false;

  // Check if element is hidden by ancestor's properties
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const parentStyle = window.getComputedStyle(parent);
    if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || parentStyle.opacity === '0') {
      return false;
    }

    // Check for overflow hidden that might hide the element
    if (parentStyle.overflow === 'hidden' || parentStyle.overflowX === 'hidden' || parentStyle.overflowY === 'hidden') {
      const parentRect = parent.getBoundingClientRect();
      // Check if element is outside parent's visible area
      if (rect.bottom < parentRect.top || rect.top > parentRect.bottom || rect.right < parentRect.left || rect.left > parentRect.right) {
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
  if (!elementAtPoint) return false;

  // Check if the element at point is our element or a descendant
  if (elementAtPoint === element || element.contains(elementAtPoint)) return true;

  // Check if the element at point is an ancestor (element might be transparent)
  if (elementAtPoint.contains(element)) return true;

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
}

function respondWith(obj, selector, xpath) {
  return {
    success: !obj.error,
    selector,
    xpath: !selector ? xpath : undefined,
    ...getTabInfo(),
    ...obj
  };
}
function respondWithError(code, message, selector, xpath) {
  return respondWith({ error: { code, message } }, selector, xpath);
}
function elementNotFound(selector, xpath) {
  return respondWithError('ELEMENT_NOT_FOUND', 'Element not found', selector, xpath);
}
function requireSelectorOrXpath(selector, xpath) {
  return respondWithError('SELECTOR_OR_XPATH_REQUIRED', 'Selector or XPath parameter required', selector, xpath);
}

const helpers = window.__kaptureHelpers = {
  //called by the background script
  _navigate: ({ url }) => {
    window.location.href = url;
  },

  // tool calls
  getTabInfo,
  dom: ({selector, xpath}) => {
    if (!selector && !xpath) {
      return respondWith({ html: document.body.outerHTML });
    }

    const element = findAllElements(selector, xpath)[0];
    if (!element) return elementNotFound(selector, xpath);

    return respondWith({ html: element.outerHTML }, selector, xpath);
  },
  elementsFromPoint: ({x, y}) => {
    if (typeof x !== 'number' || typeof y !== 'number') {
      return respondWithError('XY_REQUIRED', 'Both x and y coordinates are required');
    }
    const elements = document.elementsFromPoint(x, y);
    return respondWith({ x, y, elements: elements.map(getElementData) });
  },
  elements: ({selector, xpath, visible = 'all'}) => {
    if (!selector && !xpath) return requireSelectorOrXpath();
    
    let elements;
    try {
      elements = findAllElements(selector, xpath).map(getElementData);
    } catch (e) {
      const errorCode = selector ? 'INVALID_SELECTOR' : 'INVALID_XPATH';
      return respondWithError(errorCode, e.message, selector, xpath);
    }

    // Apply visibility filter
    if (visible !== 'all') {
      const filterVisible = String(visible) === 'true';
      elements = elements.filter(el => el.visible === filterVisible);
    }
    return respondWith({elements: elements, visible: visible !== 'all' ? visible : undefined}, selector, xpath);
  },
  element: ({selector, xpath, visible = 'all'}) => {
    const result = helpers.elements({selector, xpath, visible});
    if (!result.elements.length) return elementNotFound(selector, xpath);
    result.element = result.elements[0];
    delete result.elements;
    return result;
  },
  focus: ({selector, xpath}) => {
    if (!selector && !xpath) return requireSelectorOrXpath();

    let element;
    try {
      element = findAllElements(selector, xpath)[0];
    } catch (e) {
      const errorCode = selector ? 'INVALID_SELECTOR' : 'INVALID_XPATH';
      return respondWithError(errorCode, e.message, selector, xpath);
    }

    if (!element) return elementNotFound(selector, xpath);

    // Focus the element
    element.focus();

    // Check if element is actually focusable
    const focusableElements = ['input', 'textarea', 'select', 'button', 'a'];
    const tagName = element.tagName.toLowerCase();
    const isFocusable = focusableElements.includes(tagName) || 
                       element.hasAttribute('tabindex') || 
                       element.isContentEditable;

    if (!isFocusable) {
      // Still return success but with a warning
      return respondWith({ 
        focused: true, 
        warning: 'Element may not be focusable' 
      }, selector, xpath);
    }

    return respondWith({ focused: true }, selector, xpath);
  },
  fill: ({selector, xpath, value}) => {
    if (!selector && !xpath) return requireSelectorOrXpath();

    const element = findAllElements(selector, xpath)[0];
    if (!element) return elementNotFound(selector, xpath);

    // Check if it's an input element
    const tagName = element.tagName.toLowerCase();
    const inputTypes = ['input', 'textarea'];

    if (!inputTypes.includes(tagName) && !element.isContentEditable) {
      return respondWithError('INVALID_ELEMENT', 'Element is not fillable: ' + tagName, selector, xpath);
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

    return respondWith({ filled: true }, selector, xpath);
  },
  select: ({selector, xpath, value}) => {
    if (!selector && !xpath) return requireSelectorOrXpath();

    const element = findAllElements(selector, xpath)[0];
    if (!element) return elementNotFound(selector, xpath);

    if (element.tagName !== 'SELECT') {
      return respondWithError('INVALID_ELEMENT', 'Element is not fillable: ' + element.name, selector, xpath);
    }

    // Find option by value
    const option = Array.from(element.options).find(opt => opt.value === value);
    if (!option) {
      return respondWithError('OPTION_NOT_FOUND', 'Option not found with value: ' + value, selector, xpath);
    }

    // Select the option
    element.value = value;
    option.selected = true;

    // Trigger change event
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return respondWith({ selected: true }, selector, xpath);
  },
  blur: ({selector, xpath}) => {
    if (!selector && !xpath) return requireSelectorOrXpath();

    let element;
    try {
      element = findAllElements(selector, xpath)[0];
    } catch (e) {
      const errorCode = selector ? 'INVALID_SELECTOR' : 'INVALID_XPATH';
      return respondWithError(errorCode, e.message, selector, xpath);
    }

    if (!element) return elementNotFound(selector, xpath);

    // Blur the element
    element.blur();

    // Also remove focus from document.activeElement if it's different
    if (document.activeElement && document.activeElement !== element) {
      document.activeElement.blur();
    }

    return respondWith({ blurred: true }, selector, xpath);
  },
  _cursor: ({show}) => {
    const cursorId = 'kapture-cursor';
    let cursor = document.getElementById(cursorId);
    
    try {
      if (show === false) {
        // Hide cursor
        if (cursor) {
          cursor.style.display = 'none';
        }
        return respondWith({ visible: false });
      }
      
      // Show cursor - create if doesn't exist
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = cursorId;
        
        // Create cursor SVG
        cursor.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0 L0 16 L4.5 12.5 L7.5 20 L10 19 L7 11.5 L12 11 Z" 
                  fill="white" 
                  stroke="black" 
                  stroke-width="1"/>
          </svg>
        `;
        
        // Style the cursor container
        cursor.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 20px;
          height: 20px;
          z-index: 2147483647;
          pointer-events: none;
          transform: translate(-2px, -2px);
          transition: none;
          will-change: transform;
        `;
        
        document.body.appendChild(cursor);
      }
      
      cursor.style.display = 'block';
      return respondWith({ visible: true });
    } catch (e) {
      return respondWithError('CURSOR_ERROR', e.message);
    }
  },
  _moveMouseSVG: ({x, y}) => {
    if (typeof x !== 'number' || typeof y !== 'number') {
      return respondWithError('XY_REQUIRED', 'Both x and y coordinates are required');
    }
    
    try {
      const cursor = document.getElementById('kapture-cursor');
      if (!cursor) {
        return respondWithError('CURSOR_NOT_FOUND', 'Cursor element not found. Call _cursor with show=true first');
      }
      
      cursor.style.transform = `translate(${x - 2}px, ${y - 2}px)`;
      return respondWith({ moved: true, x, y });
    } catch (e) {
      return respondWithError('MOVE_MOUSE_SVG_ERROR', e.message);
    }
  }
};

// Mouse position tracking with throttling
let lastMouseSendTime = 0;
const MOUSE_THROTTLE_MS = 50; // Throttle to 20 updates per second

document.addEventListener('mousemove', (event) => {
  const now = Date.now();
  if (now - lastMouseSendTime < MOUSE_THROTTLE_MS) return;
  
  lastMouseSendTime = now;
  chrome.runtime.sendMessage({
    type: 'mousePosition',
    x: event.clientX,
    y: event.clientY
  });
});

// Listen for requests from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request.command) return;
  if (helpers[request.command]) {
    const result = helpers[request.command](request.params);
    Promise.resolve(result).then(sendResponse);
    return true; // Keep channel open for async response
  }
  else {
    sendResponse(respondWith({
      error: { code: 'UNKNOWN_COMMAND', message: `Command '${request.command}' not found` }
    }));
  }
});
