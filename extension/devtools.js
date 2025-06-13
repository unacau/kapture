// Create the Kapture panel in Chrome DevTools
chrome.devtools.panels.create(
  "Kapture",                    // Panel title
  "icons/icon16.png",          // Panel icon
  "panel/panel.html",          // Panel HTML page
  function(panel) {
    console.log("Kapture panel created");
    
    // Panel created callback
    panel.onShown.addListener(function(window) {
      // Called when panel is shown
      console.log("Kapture panel shown");
    });
    
    panel.onHidden.addListener(function() {
      // Called when panel is hidden
      console.log("Kapture panel hidden");
    });
  }
);