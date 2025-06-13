// Background service worker for Kapture extension
// Handles screenshot capture for DevTools panel

// Handle messages from DevTools panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'capture-screenshot') {
    captureScreenshot(request.tabId, request.bounds)
      .then(dataUrl => sendResponse({ dataUrl }))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Will respond asynchronously
  }
});

async function captureScreenshot(tabId, bounds) {
  try {
    // First, make the tab active to ensure we can capture it
    await chrome.tabs.update(tabId, { active: true });
    
    // Get the tab to find its window ID
    const tab = await chrome.tabs.get(tabId);
    
    // Small delay to ensure tab is fully active
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Capture the visible tab
    const fullDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png'
    });
    
    // If no bounds specified, return full screenshot
    if (!bounds) {
      return fullDataUrl;
    }
    
    // Otherwise, crop to the specified element bounds
    return await cropScreenshot(fullDataUrl, bounds);
  } catch (error) {
    console.error('Screenshot capture error:', error);
    // If the error is about permissions, provide clearer message
    if (error.message.includes('permission')) {
      throw new Error('Screenshot requires the extension to have access to the current page');
    }
    throw error;
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

console.log('Kapture background service worker loaded');