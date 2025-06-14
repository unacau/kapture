// Background service worker for Kapture extension
// Handles screenshot capture for DevTools panel

// Handle messages from DevTools panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'capture-screenshot') {
    captureScreenshot(request.tabId, request.bounds, request.scale)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Will respond asynchronously
  }
});

async function captureScreenshot(tabId, bounds, scale) {
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
    
    // If no bounds specified, handle full screenshot with optional scaling
    if (!bounds) {
      if (scale && scale < 1) {
        return await scaleScreenshot(fullDataUrl, scale);
      }
      return { dataUrl: fullDataUrl, scale: scale || 1 };
    }
    
    // Otherwise, crop to the specified element bounds and optionally scale
    const croppedDataUrl = await cropScreenshot(fullDataUrl, bounds);
    if (scale && scale < 1) {
      return await scaleScreenshot(croppedDataUrl, scale);
    }
    return { dataUrl: croppedDataUrl, scale: scale || 1 };
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

async function scaleScreenshot(dataUrl, scaleFactor) {
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
    
    // Convert back to blob then data URL
    const scaledBlob = await canvas.convertToBlob({ type: 'image/png' });
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
      reader.onloadend = () => resolve({ dataUrl: reader.result, scale: scaleFactor });
      reader.onerror = () => reject(new Error('Failed to convert scaled image to data URL'));
      reader.readAsDataURL(scaledBlob);
    });
  } catch (error) {
    throw new Error(`Failed to scale screenshot: ${error.message}`);
  }
}

console.log('Kapture background service worker loaded');