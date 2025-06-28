
// const getTabInfo = async(tabId) => await chrome.tabs.sendMessage(tabId, { command: 'getTabInfo' });
const getFromContentScript = async (tabId, command, params, ) => {
  return await chrome.tabs.sendMessage(tabId, { command, params });
}

const getTabInfo = async(tabId) => await getFromContentScript(tabId, 'getTabInfo');
const getElement = async (tabId, selector, xpath, visible) => {
  return await getFromContentScript(tabId, 'element', { selector, xpath, visible });
}

const respondWith = async (tabId, obj, selector, xpath) => {
  const info = await chrome.tabs.sendMessage(tabId, { command: 'getTabInfo' });
  return {
    success: !obj.error,
    selector,
    xpath: !selector ? xpath : undefined,
    ...info,
    ...obj
  };
}
const respondWithError = async (tabId, code, message, selector, xpath) => {
  return respondWith(tabId,{ error: { code, message } }, selector, xpath);
}

// Check if URL is allowed for extension
const isAllowedUrl = (url) => !!url && (url.startsWith('http://') || url.startsWith('https://'));

// Wait for content script to be ready
async function waitForContentScriptReady(tabId, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error('Timeout waiting for content script'));
    }, timeout);

    const listener = (request, sender) => {
      if (request.type === 'contentScriptReady' && sender.tab?.id === tabId) {
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      }
    };

    chrome.runtime.onMessage.addListener(listener);
  });
}

// Execute navigation and wait for content script
async function executeNavigation(tabId, navigationFn) {
  try {
    await navigationFn();
    await waitForContentScriptReady(tabId);
    return await respondWith(tabId, {});
  } catch (error) {
    return respondWithError(tabId, 'NAVIGATION_FAILED', error.message);
  }
}

export const backgroundCommands = {
  navigate: async (tabId, { url }) => {
    if (!isAllowedUrl(url)) {
      return respondWithError(tabId, 'NAVIGATION_BLOCKED', `Navigation to ${url} is not allowed`);
    }
    return executeNavigation(tabId, async () => getFromContentScript(tabId, '_navigate', { url }));
  },
  back: async (tabId) => executeNavigation(tabId, () => chrome.tabs.goBack(tabId)),
  forward: async (tabId) => executeNavigation(tabId, () => chrome.tabs.goForward(tabId)),

  screenshot: async (tabId, { scale = 0.5, quality = 0.5, format = 'webp', selector, xpath }) => {
    let elementResult;
    if (selector || xpath) {
      elementResult = await getElement(tabId, selector, xpath, true);
      if (elementResult.error) return elementResult;
    }
    else {
      elementResult = await getTabInfo(tabId)
      elementResult.element = {
        bounds: {
          x: elementResult.scrollPosition.x,
          y: elementResult.scrollPosition.y,
          width: elementResult.viewportDimensions.width,
          height: elementResult.viewportDimensions.height
        }
      };
    }

    const clip = elementResult.element.bounds;
    if (scale) {
      clip.scale = scale;
    }

    return attachDebugger(tabId, async () => {
      const screenshot = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
        format,
        quality: Math.round(quality * 100), // Chrome needs an integer percentage,
        clip
      });

      return {
        ...elementResult,
        element: undefined,
        selector: elementResult.element?.selector || undefined,
        mimeType: `image/${format}`,
        data: screenshot.data,
      };
    })
    .catch((err) => {
      return respondWithError(tabId,'SCREENSHOT_ERROR', err.message, null, null);
    });
  }
}
async function attachDebugger(tabId, action) {
  let debuggerAttached = false;
  try {
    // Attach debugger to capture screenshot without making tab active
    await chrome.debugger.attach({tabId}, '1.3');
    debuggerAttached = true;

    // Enable the Page domain
    await chrome.debugger.sendCommand({tabId}, 'Page.enable');

    return await action();
  }
  finally {
    // Always detach debugger if attached
    try {
      if (debuggerAttached) await chrome.debugger.detach({tabId: tabId});
    }
    catch (e) { }
  }
}
