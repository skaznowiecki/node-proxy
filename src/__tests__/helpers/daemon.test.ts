import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { Daemon } from '@/helpers/daemon';
import { join } from 'path';

/**
 * Unit tests for Daemon class
 *
 * Note: These tests focus on PID file management and process status checks.
 * Actual process spawning/control tests are omitted as they're complex and can be flaky.
 */
describe('Daemon - PID File Management', () => {
  const testPidFile = join(process.cwd(), 'test-daemon.pid');
  let daemon: Daemon;

  beforeEach(() => {
    daemon = new Daemon(testPidFile);
    // Clean up any existing test PID file
    if (existsSync(testPidFile)) {
      unlinkSync(testPidFile);
    }
  });

  afterEach(() => {
    // Clean up test PID file
    if (existsSync(testPidFile)) {
      unlinkSync(testPidFile);
    }
  });

  it('should write PID to file', () => {
    const pid = 12345;
    daemon.writePidFile(pid);

    expect(existsSync(testPidFile)).toBe(true);
    const content = readFileSync(testPidFile, 'utf-8');
    expect(content).toBe('12345');
  });

  it('should read PID from file', () => {
    writeFileSync(testPidFile, '54321', 'utf-8');

    const pid = daemon.getPid();
    expect(pid).toBe(54321);
  });

  it('should return null when PID file does not exist', () => {
    const pid = daemon.getPid();
    expect(pid).toBeNull();
  });

  it('should return null when PID file contains invalid data', () => {
    writeFileSync(testPidFile, 'not-a-number', 'utf-8');

    const pid = daemon.getPid();
    expect(pid).toBeNull();
  });

  it('should return null when PID file is empty', () => {
    writeFileSync(testPidFile, '', 'utf-8');

    const pid = daemon.getPid();
    expect(pid).toBeNull();
  });

  it('should remove PID file', () => {
    writeFileSync(testPidFile, '12345', 'utf-8');
    expect(existsSync(testPidFile)).toBe(true);

    daemon.removePidFile();
    expect(existsSync(testPidFile)).toBe(false);
  });

  it('should not throw when removing non-existent PID file', () => {
    expect(() => daemon.removePidFile()).not.toThrow();
  });

  it('should handle multiple write operations', () => {
    daemon.writePidFile(111);
    expect(daemon.getPid()).toBe(111);

    daemon.writePidFile(222);
    expect(daemon.getPid()).toBe(222);
  });
});

describe('Daemon - Process Status Checks', () => {
  const testPidFile = join(process.cwd(), 'test-daemon-status.pid');
  let daemon: Daemon;
  let processKillSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    daemon = new Daemon(testPidFile);
    if (existsSync(testPidFile)) {
      unlinkSync(testPidFile);
    }
    // Spy on process.kill to mock process existence checks
    processKillSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
  });

  afterEach(() => {
    if (existsSync(testPidFile)) {
      unlinkSync(testPidFile);
    }
    processKillSpy.mockRestore();
  });

  it('should return false when no PID file exists', () => {
    const running = daemon.isRunning();
    expect(running).toBe(false);
  });

  it('should return false when PID file contains invalid data', () => {
    writeFileSync(testPidFile, 'invalid', 'utf-8');

    const running = daemon.isRunning();
    expect(running).toBe(false);
  });

  it('should check if process is running using process.kill', () => {
    writeFileSync(testPidFile, '12345', 'utf-8');

    daemon.isRunning();

    expect(processKillSpy).toHaveBeenCalledWith(12345, 0);
  });

  it('should return true when process exists', () => {
    writeFileSync(testPidFile, '12345', 'utf-8');
    processKillSpy.mockImplementation(() => true);

    const running = daemon.isRunning();
    expect(running).toBe(true);
  });

  it('should return false and clean up stale PID file when process does not exist', () => {
    writeFileSync(testPidFile, '99999', 'utf-8');

    // Mock process.kill to throw ESRCH (process not found)
    processKillSpy.mockImplementation(() => {
      const error = new Error('No such process') as Error & { code?: string };
      error.code = 'ESRCH';
      throw error;
    });

    const running = daemon.isRunning();

    expect(running).toBe(false);
    // PID file should be removed
    expect(existsSync(testPidFile)).toBe(false);
  });

  it('should return true for other process.kill errors (might mean no permission)', () => {
    writeFileSync(testPidFile, '12345', 'utf-8');

    // Mock process.kill to throw EPERM (no permission)
    processKillSpy.mockImplementation(() => {
      const error = new Error('Operation not permitted') as Error & { code?: string };
      error.code = 'EPERM';
      throw error;
    });

    const running = daemon.isRunning();

    // Should return true because process might exist but we don't have permission to check
    expect(running).toBe(true);
  });
});

describe('Daemon - Constructor', () => {
  afterEach(() => {
    // Clean up any PID files created during tests
    const testPidFile = join(process.cwd(), 'custom-daemon.pid');
    if (existsSync(testPidFile)) {
      unlinkSync(testPidFile);
    }
  });

  it('should use custom PID file path when provided', () => {
    const customPath = join(process.cwd(), 'custom-daemon.pid');
    const daemon = new Daemon(customPath);

    daemon.writePidFile(12345);
    expect(existsSync(customPath)).toBe(true);

    daemon.removePidFile();
  });

  it('should use default PID file path when not provided', () => {
    const daemon = new Daemon();
    const defaultPath = join(process.cwd(), 'proxy-server.pid');

    daemon.writePidFile(12345);
    expect(existsSync(defaultPath)).toBe(true);

    daemon.removePidFile();
  });
});

describe('Daemon - Edge Cases', () => {
  const testPidFile = join(process.cwd(), 'test-daemon-edge.pid');
  let daemon: Daemon;

  beforeEach(() => {
    daemon = new Daemon(testPidFile);
    if (existsSync(testPidFile)) {
      unlinkSync(testPidFile);
    }
  });

  afterEach(() => {
    if (existsSync(testPidFile)) {
      unlinkSync(testPidFile);
    }
  });

  it('should handle PID file with whitespace', () => {
    writeFileSync(testPidFile, '  12345  \n', 'utf-8');

    const pid = daemon.getPid();
    expect(pid).toBe(12345);
  });

  it('should handle very large PID numbers', () => {
    const largePid = 2147483647; // Max 32-bit signed integer
    daemon.writePidFile(largePid);

    const pid = daemon.getPid();
    expect(pid).toBe(largePid);
  });

  it('should handle PID 0', () => {
    daemon.writePidFile(0);

    const pid = daemon.getPid();
    expect(pid).toBe(0);
  });

  it('should handle negative PID (invalid but test the parsing)', () => {
    writeFileSync(testPidFile, '-123', 'utf-8');

    const pid = daemon.getPid();
    expect(pid).toBe(-123);
  });

  it('should handle PID file with partial number', () => {
    writeFileSync(testPidFile, '123abc', 'utf-8');

    // parseInt will parse '123' from '123abc'
    const pid = daemon.getPid();
    expect(pid).toBe(123);
  });

  it('should return null for non-numeric PID file content', () => {
    writeFileSync(testPidFile, 'abc123', 'utf-8');

    const pid = daemon.getPid();
    expect(pid).toBeNull();
  });
});

/**
 * Note: Process spawning/control tests (start, stop, restart) are intentionally omitted
 * because they involve actual process management which is:
 * - Complex to test reliably
 * - Can be flaky in CI/CD environments
 * - Requires careful cleanup to avoid leaving zombie processes
 * - Better suited for manual/integration testing
 *
 * The core functionality (PID file management and status checks) is well-tested above.
 */
