const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let mcpProcess;
let messageId = 1;
const pendingRequests = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (mcpProcess) {
    mcpProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// MCP Communication
let buffer = '';

function handleMCPMessage(message) {
  // Handle JSON-RPC response
  if (message.id !== undefined && pendingRequests.has(message.id)) {
    const { resolve, reject } = pendingRequests.get(message.id);
    
    if (message.error) {
      reject(new Error(message.error.message || 'Request failed'));
    } else {
      resolve(message.result);
    }
    
    // Delete after calling resolve/reject so they can clear the timeout
    pendingRequests.delete(message.id);
  }
  // Handle notifications
  else if (message.method && !message.id) {
    mainWindow.webContents.send('mcp-notification', message);
  }
}

// IPC handlers for renderer process
ipcMain.handle('mcp-connect', async () => {
  try {
    // Spawn the MCP server
    const serverPath = path.join(__dirname, '..', 'server', 'dist', 'index.js');
    mcpProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        KAPTURE_DEBUG: '1'  // Enable debug logging to stderr
      }
    });

    // Handle stdout
    mcpProcess.stdout.on('data', (data) => {
      const dataStr = data.toString();
      mainWindow.webContents.send('mcp-notification', {
        method: 'log',
        params: { message: `[STDIO RECV] ${dataStr}`, type: 'debug' }
      });
      
      buffer += dataStr;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            handleMCPMessage(message);
          } catch (error) {
            console.error('Failed to parse MCP message:', error);
            mainWindow.webContents.send('mcp-notification', {
              method: 'log',
              params: { message: `[PARSE ERROR] ${error.message}: ${line}`, type: 'error' }
            });
          }
        }
      }
    });

    // Handle stderr
    mcpProcess.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      console.error('MCP stderr:', errorMsg);
      
      // Send all stderr as debug logs to see server logging
      mainWindow.webContents.send('mcp-notification', {
        method: 'log',
        params: { message: `[SERVER LOG] ${errorMsg.trim()}`, type: 'debug' }
      });
      
      // Check for common errors
      if (errorMsg.includes('EADDRINUSE')) {
        mainWindow.webContents.send('mcp-error', {
          type: 'PORT_IN_USE',
          message: 'Port 61822 is already in use. Another instance of the server may be running.'
        });
      } else if (errorMsg.includes('Error:')) {
        mainWindow.webContents.send('mcp-error', {
          type: 'STDERR',
          message: errorMsg
        });
      }
    });

    // Handle exit
    mcpProcess.on('exit', (code) => {
      mainWindow.webContents.send('mcp-disconnected', { code });
      mcpProcess = null;
      
      // If we haven't initialized yet and the process exits, it's likely a startup error
      if (pendingRequests.size > 0) {
        const initRequest = Array.from(pendingRequests.values()).find(
          req => req.method === 'initialize'
        );
        if (initRequest) {
          initRequest.reject(new Error('Server failed to start - check console for errors'));
        }
      }
    });

    // Send initialize request
    const response = await sendMCPRequest('initialize', {
      protocolVersion: '0.1.0',
      capabilities: {
        roots: {}
      },
      clientInfo: {
        name: 'kapture-test-app',
        version: '1.0.0'
      }
    });

    // Send initialized notification
    sendMCPNotification('initialized', {});

    return { success: true, capabilities: response.capabilities };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mcp-disconnect', async () => {
  if (mcpProcess) {
    mcpProcess.kill();
    mcpProcess = null;
  }
  return { success: true };
});

ipcMain.handle('mcp-request', async (event, method, params) => {
  if (!mcpProcess) {
    throw new Error('MCP server not connected');
  }
  return await sendMCPRequest(method, params);
});

function sendMCPRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = messageId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    // Set timeout
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request timeout: ${method}`));
    }, 5000);

    // Store pending request with timeout-aware handlers
    pendingRequests.set(id, { 
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      method,
      timeout
    });

    // Send request
    const requestStr = JSON.stringify(request);
    mainWindow.webContents.send('mcp-notification', {
      method: 'log',
      params: { message: `[STDIO SEND] ${requestStr}`, type: 'debug' }
    });
    mcpProcess.stdin.write(requestStr + '\n');
  });
}

function sendMCPNotification(method, params = {}) {
  if (!mcpProcess) return;
  
  const notification = {
    jsonrpc: '2.0',
    method,
    params
  };

  mcpProcess.stdin.write(JSON.stringify(notification) + '\n');
}