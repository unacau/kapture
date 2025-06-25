// page-helpers.js - Content script that provides helper functions
const kaptureHelpers = window.__kaptureHelpers = {
  getTabInfo: function() {
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
  // Other helper functions can be added here later
};

// Listen for requests from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.name && kaptureHelpers[request.name]) {
    sendResponse(kaptureHelpers[request.name](request.args));
    return false;
  }
});
