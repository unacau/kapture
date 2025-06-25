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
}

function respondWith(obj) {
  return {
    ...getTabInfo(),
    ...obj
  };
}
const helpers = window.__kaptureHelpers = {
  getTabInfo,
  navigate: ({url}) => {
    window.location.href = url;
    return respondWith({ success: true });
  },
  back: () => {
    window.history.back();
    return respondWith({ success: true });
  },
  forward: () => {
    window.history.forward();
    return respondWith({ success: true });
  },
  reload: () => {
    window.location.reload();
    return respondWith({ success: true });
  },
};

// Listen for requests from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.command && helpers[request.command]) {
    sendResponse(helpers[request.command](request.params));
    return false;
  }
});
