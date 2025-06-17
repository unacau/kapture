import * as fs from 'fs';
import * as path from 'path';

// Logger that writes to stderr or a file instead of stdout
// This prevents interference with MCP protocol on stdout

class Logger {
  private logFile?: fs.WriteStream;

  constructor() {
    // Check if we should log to file
    if (process.env.KAPTURE_LOG_FILE) {
      this.logFile = fs.createWriteStream(process.env.KAPTURE_LOG_FILE, { flags: 'a' });
    }
  }

  log(...args: any[]) {
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;

    if (this.logFile) {
      this.logFile.write(logLine);
    }
    // else if (process.env.KAPTURE_DEBUG) {
    //   // Only write to stderr if debug mode is enabled
    //   process.stderr.write(logLine);
    // }
  }

  error(...args: any[]) {
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ERROR: ${message}\n`;

    if (this.logFile) {
      this.logFile.write(logLine);
    } else {
      // Always write errors to stderr
      process.stderr.write(logLine);
    }
  }

  warn(...args: any[]) {
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] WARN: ${message}\n`;

    if (this.logFile) {
      this.logFile.write(logLine);
    }
    // else if (process.env.KAPTURE_DEBUG) {
    //   process.stderr.write(logLine);
    // }
  }
}

export const logger = new Logger();
