// Import helper functions from background-commands
import { getFromContentScript, respondWith, respondWithError, attachDebugger } from './background-commands.js';

// Helper to get element with visible filtering
const getElement = async (tabId, selector, xpath, visible) => {
  return await getFromContentScript(tabId, 'element', { selector, xpath, visible });
}

// Click implementation with visual cursor animation
export async function click({tabId, mousePosition}, { selector, xpath }) {
  // Validate that either selector or xpath is provided
  if (!selector && !xpath) {
    return respondWithError(tabId, 'SELECTOR_OR_XPATH_REQUIRED', 'Either selector or xpath is required');
  }

  // Get element and validate it exists and is visible
  const elementResult = await getElement(tabId, selector, xpath, true);
  if (elementResult.error) return elementResult;

  // Get current mouse position
  const currentPosition = mousePosition || { x: 0, y: 0 };

  // Calculate target position (center of element)
  const targetX = elementResult.element.bounds.x + elementResult.element.bounds.width / 2;
  const targetY = elementResult.element.bounds.y + elementResult.element.bounds.height / 2;

  try {
    // Show cursor
    await getFromContentScript(tabId, '_cursor', { show: true });
    
    // Set initial cursor position
    await getFromContentScript(tabId, '_moveMouseSVG', { x: currentPosition.x, y: currentPosition.y });

    // Calculate animation based on pixels per second
    const pixelsPerSecond = 500; // Adjust for desired speed
    const distance = Math.sqrt(Math.pow(targetX - currentPosition.x, 2) + Math.pow(targetY - currentPosition.y, 2));
    const duration = Math.min(1000, (distance / pixelsPerSecond) * 1000); // Cap at 1s for very long distances
    const frameInterval = 16; // ~60fps
    const steps = Math.max(1, Math.ceil(duration / frameInterval)); // At least 1 step
    const deltaX = (targetX - currentPosition.x) / steps;
    const deltaY = (targetY - currentPosition.y) / steps;

    await attachDebugger(tabId, async () => {
      const sendCmd = (cmd, params) => chrome.debugger.sendCommand({ tabId }, cmd, params);
      const dispatchMouseEvent = (params) => sendCmd('Input.dispatchMouseEvent', params);

      // Enable Input domain for mouse events
      // await sendCmd('Input.enable');

      // Animate cursor movement
      for (let i = 1; i <= steps; i++) {
        const x = currentPosition.x + (deltaX * i);
        const y = currentPosition.y + (deltaY * i);

        // Move visual cursor
        await getFromContentScript(tabId, '_moveMouseSVG', { x, y });

        // Send mouse move event
        await dispatchMouseEvent({ type: 'mouseMoved', x, y });

        // Wait for next frame
        await new Promise(resolve => setTimeout(resolve, frameInterval));
      }

      // Click sequence
      await dispatchMouseEvent({ type: 'mousePressed', x: targetX, y: targetY, button: 'left', clickCount: 1 });
      await dispatchMouseEvent({ type: 'mouseReleased', x: targetX, y: targetY, button: 'left', clickCount: 1 });
    });

    // Hide cursor after 1 second
    setTimeout(async () => {
      await getFromContentScript(tabId, '_cursor', { show: false });
    }, 1000);

    return respondWith(tabId, { clicked: true }, selector, xpath);
  } catch (error) {
    // Make sure cursor is hidden on error
    await getFromContentScript(tabId, '_cursor', { show: false });
    return respondWithError(tabId, 'CLICK_FAILED', error.message, selector, xpath);
  }
}