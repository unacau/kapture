
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

export const commands = {
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

    let debuggerAttached = false;
    try {
      // Attach debugger to capture screenshot without making tab active
      await chrome.debugger.attach({ tabId }, '1.3');
      debuggerAttached = true;

      // Enable the Page domain
      await chrome.debugger.sendCommand({ tabId }, 'Page.enable');

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
    } catch (error) {
      console.error(error);
      console.log(bounds);
      return respondWithError(tabId,'SCREENSHOT_ERROR', error.message, null, null);
    } finally {
      // Always detach debugger if attached
      if (debuggerAttached) {
        try {
          await chrome.debugger.detach({ tabId: tabId });
        } catch (detachError) {
          console.error('Failed to detach debugger after screenshot:', detachError);
        }
      }
    }
  }
}
