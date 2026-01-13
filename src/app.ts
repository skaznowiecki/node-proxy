#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { ProxyConfig } from './lib/proxy-config';
import { ProxyServer } from './lib/proxy-server';
import { type ServerConfig } from './types/server-config';
import { parseArguments, Command } from './helpers/parse-arguments';
import { Daemon } from './helpers/daemon';
import { Logger } from './helpers/logger';
import { ConfigValidator } from './lib/config-validator';
import { ConfigPreviewer } from './lib/config-previewer';

let proxyServer: ProxyServer | null = null;
let daemon: Daemon | null = null;

/**
 * Start the proxy server (daemon mode only)
 */
async function startServer(rulesPath: string): Promise<void> {
  // Load configuration file
  const configContent = readFileSync(rulesPath, 'utf-8');
  const config = ProxyConfig.loadFromString(configContent);

  // Server configuration for multi-threading
  const serverConfig: ServerConfig = {
    cluster: false, // Enable cluster mode
    workers: 4, // Number of workers (optional, defaults to CPU count)
  };

  // Create and start proxy server
  proxyServer = new ProxyServer(config, serverConfig);
  proxyServer.start();

  // Write PID file (always daemon)
  if (daemon) {
    daemon.writePidFile(process.pid);
  }

  // Handle graceful shutdown
  const shutdown = (): void => {
    if (proxyServer) {
      const logger = new Logger('Shutdown');
      logger.info('Shutting down proxy servers...');
      proxyServer.stop();
      if (daemon) {
        daemon.removePidFile();
      }
      process.exit(0);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Detach from terminal (always daemon)
  process.stdin.setRawMode?.(false);
  process.stdin.resume();
}

/**
 * Handle validate command - validates config and shows preview
 */
function handleValidateCommand(rulesPath: string): void {
  const logger = new Logger('Validate');

  try {
    // Read configuration file
    const configContent = readFileSync(rulesPath, 'utf-8');

    // Validate configuration
    const validator = new ConfigValidator();
    const result = validator.validate(configContent);

    // Display errors if any
    if (result.errors.length > 0) {
      logger.error(`Configuration validation failed with ${result.errors.length} error(s):`);
      for (const error of result.errors) {
        logger.error(`  [${error.code}] ${error.path}: ${error.message}`);
      }
      process.exit(1);
    }

    // Display warnings if any
    if (result.warnings.length > 0) {
      logger.warn(`Configuration has ${result.warnings.length} warning(s):`);
      for (const warning of result.warnings) {
        logger.warn(`  [${warning.code}] ${warning.path}: ${warning.message}`);
      }
      // eslint-disable-next-line no-console
      console.log(''); // Blank line
    }

    // Show preview if valid
    if (result.valid && result.config) {
      logger.info('Configuration is valid!');
      // eslint-disable-next-line no-console
      console.log(''); // Blank line

      const previewer = new ConfigPreviewer();
      // eslint-disable-next-line no-console
      console.log(previewer.preview(result.config));
    }

    process.exit(0);
  } catch (error) {
    logger.error(
      `Failed to validate configuration: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}

/**
 * Handle daemon commands (start, stop, restart, status)
 */
function handleDaemonCommand(command: Command, rulesPath: string, pidFile?: string): void {
  const logger = new Logger('Daemon');
  daemon = new Daemon(pidFile);

  switch (command) {
    case Command.START: {
      if (daemon.isRunning()) {
        const pid = daemon.getPid();
        logger.error(`Daemon is already running (PID: ${pid})`);
        process.exit(1);
      }

      // Start as daemon
      // Use the compiled JS file or the TypeScript source if in dev mode
      const isDev = process.env.NODE_ENV !== 'production' || !__dirname.includes('dist');
      const scriptPath = isDev
        ? join(process.cwd(), 'src', 'app.ts')
        : join(__dirname, 'app.js');

      // Use tsx for TypeScript files, node for compiled JS
      const executable = isDev ? 'tsx' : 'node';
      const args = isDev
        ? [scriptPath, 'start', '--rules', rulesPath, '--internal-daemon-process']
        : [scriptPath, 'start', '--rules', rulesPath, '--internal-daemon-process'];

      if (pidFile) {
        args.push('--pid-file', pidFile);
      }

      try {
        // Spawn the daemon process
        const child = spawn(executable, args, {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        
        // Wait a moment to verify it started
        setTimeout(() => {
          try {
            if (child.pid) {
              process.kill(child.pid, 0);
              logger.info(`Daemon started successfully (PID: ${child.pid})`);
              process.exit(0);
            } else {
              throw new Error('Failed to get child process PID');
            }
          } catch (error) {
            logger.error(`Failed to start daemon: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
          }
        }, 1000);
      } catch (error) {
        logger.error(`Failed to start daemon: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
      break;
    }

    case Command.STOP: {
      if (!daemon.isRunning()) {
        logger.error('Daemon is not running');
        process.exit(1);
      }

      try {
        daemon.stop();
        logger.info('Daemon stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error(`Failed to stop daemon: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
      break;
    }

    case Command.RESTART: {
      try {
        const isDev = process.env.NODE_ENV !== 'production' || !__dirname.includes('dist');
        const scriptPath = isDev
          ? join(process.cwd(), 'src', 'app.ts')
          : join(__dirname, 'app.js');
        const executable = isDev ? 'tsx' : 'node';
        const args = isDev
          ? [scriptPath, 'start', '--rules', rulesPath, '--internal-daemon-process']
          : [scriptPath, 'start', '--rules', rulesPath, '--internal-daemon-process'];

        if (pidFile) {
          args.push('--pid-file', pidFile);
        }
        
        // Stop first
        if (daemon.isRunning()) {
          daemon.stop();
          // Wait a moment for cleanup
          const start = Date.now();
          while (Date.now() - start < 1000) {
            // Busy wait
          }
        }
        
        // Start new process
        const child = spawn(executable, args, {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        
        setTimeout(() => {
          try {
            if (child.pid) {
              process.kill(child.pid, 0);
              logger.info(`Daemon restarted successfully (PID: ${child.pid})`);
              process.exit(0);
            } else {
              throw new Error('Failed to get child process PID');
            }
          } catch (error) {
            logger.error(`Failed to restart daemon: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
          }
        }, 1000);
      } catch (error) {
        logger.error(`Failed to restart daemon: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
      break;
    }

    case Command.STATUS: {
      const status = daemon.status();
      if (status.running) {
        logger.info(`Daemon is running (PID: ${status.pid})`);
        process.exit(0);
      } else {
        logger.info('Daemon is not running');
        process.exit(1);
      }
      break;
    }

    default:
      logger.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

async function main(): Promise<void> {
  try {
    // Parse command-line arguments
    const args = parseArguments();

    // Check if this is an internal daemon process
    if (args.internalDaemon) {
      // Initialize daemon and start server directly
      daemon = new Daemon(args.pidFile);
      await startServer(args.rulesPath);
      return;
    }

    // Handle validate command separately
    if (args.command === Command.VALIDATE) {
      handleValidateCommand(args.rulesPath);
      return;
    }

    // All other commands are daemon commands
    handleDaemonCommand(args.command, args.rulesPath, args.pidFile);
  } catch (error) {
    const logger = new Logger('Error');
    logger.error(
      'Failed to execute command:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

void main();
