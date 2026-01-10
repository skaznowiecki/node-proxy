import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { Logger } from './logger';

/**
 * Default PID file location
 * Uses /tmp/proxy.pid (universally writable on all Unix-like systems)
 * Production deployments should override with --pid-file /var/run/proxy.pid
 */
const DEFAULT_PID_FILE = '/tmp/proxy.pid';

/**
 * Daemon helper for managing background processes
 */
export class Daemon {
    private pidFile: string;
    private logger: Logger;

    constructor(pidFile?: string) {
        this.pidFile = pidFile ?? DEFAULT_PID_FILE;
        this.logger = new Logger('Daemon');
    }

    /**
     * Check if the daemon is running
     */
    isRunning(): boolean {
        if (!existsSync(this.pidFile)) {
            return false;
        }

        try {
            const pid = parseInt(readFileSync(this.pidFile, 'utf-8').trim(), 10);
            if (isNaN(pid)) {
                return false;
            }

            // Check if process is actually running
            // On Unix systems, kill with signal 0 checks if process exists
            try {
                process.kill(pid, 0);
                return true;
            } catch (error: unknown) {
                // Process doesn't exist
                if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
                    // Clean up stale PID file
                    this.removePidFile();
                    return false;
                }
                // Other error might mean we don't have permission, but process exists
                return true;
            }
        } catch {
            return false;
        }
    }

    /**
     * Get the PID from the PID file
     */
    getPid(): number | null {
        if (!existsSync(this.pidFile)) {
            return null;
        }

        try {
            const pid = parseInt(readFileSync(this.pidFile, 'utf-8').trim(), 10);
            return isNaN(pid) ? null : pid;
        } catch {
            return null;
        }
    }

    /**
     * Write PID to file
     */
    writePidFile(pid: number): void {
        try {
            writeFileSync(this.pidFile, pid.toString(), 'utf-8');
        } catch (error) {
            throw new Error(`Failed to write PID file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Remove PID file
     */
    removePidFile(): void {
        try {
            if (existsSync(this.pidFile)) {
                unlinkSync(this.pidFile);
            }
        } catch {
            // Ignore errors when removing PID file
        }
    }

    /**
     * Start the daemon process
     */
    start(scriptPath: string, args: string[]): void {
        if (this.isRunning()) {
            const pid = this.getPid();
            throw new Error(`Daemon is already running (PID: ${pid})`);
        }

        // Spawn process in background
        const child = spawn('node', [scriptPath, ...args], {
            detached: true,
            stdio: 'ignore',
        });

        // Unref the child process so parent can exit
        child.unref();

        // Write PID file immediately (child process will update it when it starts)
        // Note: The actual daemon process will write its own PID
        this.logger.info(`Starting daemon process (PID: ${child.pid})`);

        // Give it a moment to start
        setTimeout(() => {
            try {
                // Check if process is still alive
                if (child.pid) {
                    process.kill(child.pid, 0);
                }
            } catch {
                throw new Error('Failed to start daemon process');
            }
        }, 500);
    }

    /**
     * Stop the daemon process
     */
    stop(): void {
        if (!this.isRunning()) {
            throw new Error('Daemon is not running');
        }

        const pid = this.getPid();
        if (!pid) {
            throw new Error('Could not read PID from file');
        }

        try {
            // Send SIGTERM for graceful shutdown
            process.kill(pid, 'SIGTERM');

            // Wait a bit for graceful shutdown
            let attempts = 0;
            const maxAttempts = 10;
            while (attempts < maxAttempts && this.isRunning()) {
                // Wait 500ms
                const start = Date.now();
                while (Date.now() - start < 500) {
                    // Busy wait
                }
                attempts++;
            }

            // If still running, force kill
            if (this.isRunning()) {
                this.logger.warn('Process did not shut down gracefully, forcing kill...');
                process.kill(pid, 'SIGKILL');

                // Wait a bit more
                attempts = 0;
                while (attempts < 5 && this.isRunning()) {
                    const start = Date.now();
                    while (Date.now() - start < 200) {
                        // Busy wait
                    }
                    attempts++;
                }
            }

            if (!this.isRunning()) {
                this.removePidFile();
                this.logger.info('Daemon stopped successfully');
            } else {
                throw new Error('Failed to stop daemon process');
            }
        } catch (error: unknown) {
            if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
                // Process doesn't exist, clean up PID file
                this.removePidFile();
                this.logger.info('Process was not running, cleaned up PID file');
            } else if (error instanceof Error) {
                throw new Error(`Failed to stop daemon: ${error.message}`);
            } else {
                throw new Error('Failed to stop daemon: Unknown error');
            }
        }
    }

    /**
     * Restart the daemon
     */
    restart(scriptPath: string, args: string[]): void {
        if (this.isRunning()) {
            this.stop();
            // Wait a moment for cleanup
            const start = Date.now();
            while (Date.now() - start < 1000) {
                // Busy wait
            }
        }
        this.start(scriptPath, args);
    }

    /**
     * Get daemon status
     */
    status(): { running: boolean; pid: number | null } {
        const running = this.isRunning();
        const pid = running ? this.getPid() : null;
        return { running, pid };
    }
}

