import { keypress } from './background-keypress.js';
import { click, hover } from './background-click.js';
import { navigate, back, forward, close } from './background-navigate.js';
import { screenshot } from './background-screenshot.js';
import { getLogs } from './background-console.js';

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


export const backgroundCommands = {
  navigate,
  back,
  forward,
  close,
  click,
  hover,
  keypress,
  screenshot,
  getLogs
}
