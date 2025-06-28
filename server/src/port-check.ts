import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';

const exec = promisify(execCallback);

/**
 * Check if a port is already in use and get process info
 */
async function getPortInfo(port: number): Promise<{ inUse: boolean; pid?: string; command?: string }> {
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin' || platform === 'linux') {
    command = `lsof -i :${port} -P -n | grep LISTEN || true`;
  } else if (platform === 'win32') {
    command = `netstat -ano | findstr :${port} || exit 0`;
  } else {
    return { inUse: false };
  }

  const { stdout } = await exec(command);

  if (stdout.trim()) {
    if (platform === 'darwin' || platform === 'linux') {
      const lines = stdout.trim().split('\n');
      const parts = lines[0].split(/\s+/);
      return {
        inUse: true,
        pid: parts[1],
        command: parts[0]
      };
    } else if (platform === 'win32') {
      const parts = stdout.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      return {
        inUse: true,
        pid: pid
      };
    }
  }

  return { inUse: false };
}

/**
 * Check if port is in use and exit with helpful message if it is
 */
export async function checkIfPortInUse(port: number): Promise<void> {
  const portCheck = await getPortInfo(port);

  if (portCheck.inUse) {
    logger.error('='.repeat(35));
    logger.error(`ERROR: Port ${port} is already in use`);
    logger.error('='.repeat(35));

    if (portCheck.pid) {
      logger.error(`Process ID: ${portCheck.pid}`);
      if (portCheck.command) {
        logger.error(`Process: ${portCheck.command}`);
      }
      logger.error('');
      logger.error('To kill the process, run:');

      if (process.platform === 'darwin' || process.platform === 'linux') {
        logger.error(`  kill -9 ${portCheck.pid}`);
      } else if (process.platform === 'win32') {
        logger.error(`  taskkill /PID ${portCheck.pid} /F`);
      }
    }

    logger.error('='.repeat(35));
    process.exit(1);
  }
}
