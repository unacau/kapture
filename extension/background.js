// Background service worker for Kapture extension
// Handles screenshot capture and message routing between DevTools panel and content scripts

// Track content script readiness per tab
const contentScriptReady = new Map();

// Track DevTools panel connections per tab
const devToolsConnections = new Map();

// Handle messages from DevTools panel and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'capture-screenshot') {
    captureScreenshot(request.tabId, request.bounds, request.scale, request.format, request.quality)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Will respond asynchronously
  }

  // Track when content scripts are ready
  if (request.type === 'kapture-content-script-ready') {
    const tabId = sender.tab?.id || request.tabId;
    if (tabId) {
      contentScriptReady.set(parseInt(tabId), true);
      console.log(`Content script ready for tab ${tabId}`);
    }
    sendResponse({ success: true });
    return;
  }

  // Forward tab info updates from content script to DevTools panel
  if (request.type === 'kapture-tab-info-update' && sender.tab) {
    const tabId = sender.tab.id;
    const connection = devToolsConnections.get(tabId);
    if (connection) {
      connection.postMessage({
        type: 'tab-info-update',
        tabInfo: request.tabInfo
      });
    }
    sendResponse({ success: true });
    return;
  }

  // Forward console log entries from content script to DevTools panel
  if (request.type === 'kapture-console-log' && sender.tab) {
    const tabId = sender.tab.id;
    const connection = devToolsConnections.get(tabId);
    if (connection) {
      connection.postMessage({
        type: 'console-log',
        logEntry: request.logEntry
      });
    }
    sendResponse({ success: true });
    return;
  }

  // Forward console clear from content script to DevTools panel
  if (request.type === 'kapture-console-clear' && sender.tab) {
    const tabId = sender.tab.id;
    const connection = devToolsConnections.get(tabId);
    if (connection) {
      connection.postMessage({
        type: 'console-clear'
      });
    }
    sendResponse({ success: true });
    return;
  }

  // Register DevTools panel connection
  if (request.type === 'register-devtools-panel') {
    // This will be handled by onConnect listener below
    return;
  }

  // Route commands from DevTools to content scripts
  if (request.type === 'kapture-command') {
    const tabId = parseInt(request.tabId);

    // Forward the command to content script
    chrome.tabs.sendMessage(tabId, request, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({
          type: 'kapture-response',
          requestId: request.requestId,
          success: false,
          error: {
            message: chrome.runtime.lastError.message,
            code: 'MESSAGING_ERROR'
          }
        });
      } else {
        sendResponse(response);
      }
    });

    return true; // Will respond asynchronously
  }
});

// Handle connections from DevTools panels
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'devtools-panel') {
    // Extract tab ID from the port name or first message
    port.onMessage.addListener((msg) => {
      if (msg.type === 'register' && msg.tabId) {
        const tabId = parseInt(msg.tabId);
        devToolsConnections.set(tabId, port);

        // Clean up when port disconnects
        port.onDisconnect.addListener(() => {
          devToolsConnections.delete(tabId);
        });
      }
    });
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptReady.delete(tabId);
  devToolsConnections.delete(tabId);
});

// Listen for tab navigation to clear content script ready state
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || changeInfo.url) {
    // Clear the ready state when the tab navigates
    contentScriptReady.delete(tabId);
    console.log(`Tab ${tabId} navigated, cleared content script ready state`);
  }
});

async function captureScreenshot(tabId, bounds, scale, format = 'webp', quality = 0.85) {
  let debuggerAttached = false;
  
  try {
    // Attach debugger to capture screenshot without making tab active
    await chrome.debugger.attach({ tabId: tabId }, '1.3');
    debuggerAttached = true;
    
    // Enable the Page domain
    await chrome.debugger.sendCommand({ tabId: tabId }, 'Page.enable');
    
    // Capture screenshot using debugger protocol
    const screenshot = await chrome.debugger.sendCommand(
      { tabId: tabId },
      'Page.captureScreenshot',
      { format: 'png' }
    );
    
    // Convert base64 to data URL
    const fullDataUrl = `data:image/png;base64,${screenshot.data}`;

    // Auto-detect high DPI and adjust scale if not explicitly set
    let effectiveScale = scale;
    if (!scale && bounds && bounds.devicePixelRatio > 1) {
      // For high DPI displays, automatically use more aggressive scaling
      effectiveScale = Math.min(0.5 / bounds.devicePixelRatio, 0.3);
    } else if (!scale) {
      effectiveScale = 0.3; // Default scale
    }

    // If no bounds specified, handle full screenshot with optional scaling
    if (!bounds) {
      // Always compress to apply format conversion
      if (effectiveScale && effectiveScale < 1) {
        return await scaleAndCompressScreenshot(fullDataUrl, effectiveScale, format, quality);
      }
      return await compressScreenshot(fullDataUrl, format, quality, effectiveScale || 1);
    }

    // Otherwise, crop to the specified element bounds and optionally scale
    const croppedDataUrl = await cropScreenshot(fullDataUrl, bounds);
    // Always compress to apply format conversion
    if (effectiveScale && effectiveScale < 1) {
      return await scaleAndCompressScreenshot(croppedDataUrl, effectiveScale, format, quality);
    }
    return await compressScreenshot(croppedDataUrl, format, quality, effectiveScale || 1);
  } catch (error) {
    console.error('Screenshot capture error:', error);
    // If the error is about permissions, provide clearer message
    if (error.message.includes('permission')) {
      throw new Error('Screenshot requires the extension to have access to the current page');
    }
    throw error;
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

async function cropScreenshot(dataUrl, bounds) {
  try {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create bitmap from blob
    const imageBitmap = await createImageBitmap(blob);

    // Account for device pixel ratio
    const dpr = bounds.devicePixelRatio || 1;

    // Create offscreen canvas for cropping
    const canvas = new OffscreenCanvas(
      bounds.width * dpr,
      bounds.height * dpr
    );
    const ctx = canvas.getContext('2d');

    // Draw the cropped portion
    ctx.drawImage(
      imageBitmap,
      bounds.x * dpr,      // Source X
      bounds.y * dpr,      // Source Y
      bounds.width * dpr,  // Source width
      bounds.height * dpr, // Source height
      0,                   // Destination X
      0,                   // Destination Y
      bounds.width * dpr,  // Destination width
      bounds.height * dpr  // Destination height
    );

    // Convert back to blob then data URL
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to convert cropped image to data URL'));
      reader.readAsDataURL(croppedBlob);
    });
  } catch (error) {
    throw new Error(`Failed to crop screenshot: ${error.message}`);
  }
}

async function scaleAndCompressScreenshot(dataUrl, scaleFactor, format = 'webp', quality = 0.85) {
  try {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create bitmap from blob
    const imageBitmap = await createImageBitmap(blob);

    // Calculate new dimensions
    const newWidth = Math.round(imageBitmap.width * scaleFactor);
    const newHeight = Math.round(imageBitmap.height * scaleFactor);

    // Create offscreen canvas for scaling
    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');

    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw the scaled image
    ctx.drawImage(
      imageBitmap,
      0, 0, imageBitmap.width, imageBitmap.height,  // Source
      0, 0, newWidth, newHeight                      // Destination
    );

    // Convert to the specified format with quality
    const mimeType = format === 'webp' ? 'image/webp' : format === 'jpeg' ? 'image/jpeg' : 'image/png';
    let scaledBlob;

    try {
      scaledBlob = await canvas.convertToBlob({
        type: mimeType,
        quality: mimeType === 'image/png' ? undefined : quality
      });

      // Check if the format was actually applied
      if (scaledBlob.type !== mimeType && mimeType !== 'image/png') {
        console.warn(`Browser doesn't support ${mimeType}, falling back to ${scaledBlob.type}`);
        // Try JPEG as fallback for WebP
        if (format === 'webp') {
          scaledBlob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: quality
          });
        }
      }
    } catch (error) {
      console.error(`Failed to convert to ${mimeType}:`, error);
      // Fallback to JPEG
      scaledBlob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: quality
      });
    }
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onloadend = () => resolve({
        dataUrl: reader.result,
        scale: scaleFactor,
        format: format,
        quality: quality
      });
      reader.onerror = () => reject(new Error('Failed to convert scaled image to data URL'));
      reader.readAsDataURL(scaledBlob);
    });
  } catch (error) {
    throw new Error(`Failed to scale screenshot: ${error.message}`);
  }
}

async function compressScreenshot(dataUrl, format = 'webp', quality = 0.85, scale = 1) {
  try {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create bitmap from blob
    const imageBitmap = await createImageBitmap(blob);

    // Create offscreen canvas
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');

    // Draw the image
    ctx.drawImage(imageBitmap, 0, 0);

    // Convert to the specified format with quality
    const mimeType = format === 'webp' ? 'image/webp' : format === 'jpeg' ? 'image/jpeg' : 'image/png';
    let compressedBlob;

    try {
      compressedBlob = await canvas.convertToBlob({
        type: mimeType,
        quality: mimeType === 'image/png' ? undefined : quality
      });

      // Check if the format was actually applied
      if (compressedBlob.type !== mimeType && mimeType !== 'image/png') {
        console.warn(`Browser doesn't support ${mimeType}, falling back to ${compressedBlob.type}`);
        // Try JPEG as fallback for WebP
        if (format === 'webp') {
          compressedBlob = await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: quality
          });
        }
      }
    } catch (error) {
      console.error(`Failed to convert to ${mimeType}:`, error);
      // Fallback to JPEG
      compressedBlob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: quality
      });
    }
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onloadend = () => resolve({
        dataUrl: reader.result,
        scale: scale,
        format: format,
        quality: quality
      });
      reader.onerror = () => reject(new Error('Failed to convert compressed image to data URL'));
      reader.readAsDataURL(compressedBlob);
    });
  } catch (error) {
    throw new Error(`Failed to compress screenshot: ${error.message}`);
  }
}

console.log('Kapture background service worker loaded');
