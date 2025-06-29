import { keypress } from './background-keypress.js';
import { click, hover } from './background-click.js';
import { navigate, back, forward, close } from './background-navigate.js';

export const getFromContentScript = async (tabId, command, params, ) => {
  return await chrome.tabs.sendMessage(tabId, { command, params });
}

export const getTabInfo = async(tabId) => await getFromContentScript(tabId, 'getTabInfo');
export const getElement = async (tabId, selector, xpath, visible) => {
  return await getFromContentScript(tabId, 'element', { selector, xpath, visible });
}

export const respondWith = async (tabId, obj, selector, xpath) => {
  const info = await getTabInfo(tabId);
  return {
    success: !obj.error,
    selector,
    xpath: !selector ? xpath : undefined,
    ...info,
    ...obj
  };
}
export const respondWithError = async (tabId, code, message, selector, xpath) => {
  return respondWith(tabId,{ error: { code, message } }, selector, xpath);
}


export const backgroundCommands = {
  navigate,
  back,
  forward,
  close,
  click,
  hover,
  keypress,
  screenshot: async ({tabId}, { scale = 0.5, quality = 0.5, format = 'webp', selector, xpath }) => {
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
export async function attachDebugger(tabId, action) {
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
