#!/usr/bin/env node

// CLI entry point for running Kapture MCP server with npx
// This wrapper launches a server in a separate process.

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    // Start server in a separate process
    const serverPath = join(__dirname, 'index.js');
    const child = spawn('node', [serverPath], {
      detached: true,
      stdio: 'ignore' // Don't inherit stdio - completely detached
    });

    // Detach the child process so it continues running after parent exits
    child.unref();
    
    // Exit silently
    process.exit(0);

  } catch (error) {
    // Exit with error code but no output
    process.exit(1);
  }
}

// Run the main function
main();