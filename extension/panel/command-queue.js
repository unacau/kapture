// Command Queue Manager for Kapture
// Ensures commands are executed sequentially with proper timeout handling

class CommandQueue {
  constructor(executor) {
    this.executor = executor;
    this.queue = [];
    this.isProcessing = false;
    this.currentCommand = null;
    this.defaultTimeout = 30000; // 30 seconds
  }

  // Add command to queue
  async enqueue(command) {
    return new Promise((resolve, reject) => {
      const queueItem = {
        id: command.id,
        command: command.command,
        params: command.params,
        timeout: command.params.timeout || this.defaultTimeout,
        resolve,
        reject,
        enqueuedAt: Date.now()
      };

      this.queue.push(queueItem);
      console.log(`Command queued: ${command.command} (${command.id})`);
      
      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  // Process commands from the queue
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      this.currentCommand = item;

      try {
        console.log(`Executing command: ${item.command} (${item.id})`);
        
        // Execute with timeout
        const result = await this.executeWithTimeout(item);
        
        console.log(`Command completed: ${item.command} (${item.id})`);
        item.resolve({
          id: item.id,
          type: 'response',
          success: true,
          result
        });
      } catch (error) {
        console.error(`Command failed: ${item.command} (${item.id})`, error);
        item.reject({
          id: item.id,
          type: 'response',
          success: false,
          error: {
            message: error.message,
            code: error.code || 'EXECUTION_ERROR'
          }
        });
      } finally {
        this.currentCommand = null;
      }
    }

    this.isProcessing = false;
  }

  // Execute command with timeout
  async executeWithTimeout(item) {
    return new Promise(async (resolve, reject) => {
      let timeoutId;
      
      // Setup timeout
      const timeoutPromise = new Promise((_, timeoutReject) => {
        timeoutId = setTimeout(() => {
          timeoutReject(new Error(`Command timeout after ${item.timeout}ms`));
        }, item.timeout);
      });

      try {
        // Race between command execution and timeout
        const result = await Promise.race([
          this.executor.execute(item.command, item.params),
          timeoutPromise
        ]);
        
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  // Get queue status
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      currentCommand: this.currentCommand ? {
        id: this.currentCommand.id,
        command: this.currentCommand.command
      } : null
    };
  }

  // Clear the queue
  clear() {
    // Reject all pending commands
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item.reject({
        id: item.id,
        type: 'response',
        success: false,
        error: {
          message: 'Queue cleared',
          code: 'QUEUE_CLEARED'
        }
      });
    }
  }
}

// Export for use in panel.js
window.CommandQueue = CommandQueue;