import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '@/helpers/logger';

/**
 * Unit tests for Logger class
 */
describe('Logger - Basic Functionality', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    // Mock console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    // Restore console methods
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
    // Clear DEBUG env var
    delete process.env.DEBUG;
  });

  it('should log info messages', () => {
    const logger = new Logger();
    logger.info('Test message');

    expect(consoleSpy.log).toHaveBeenCalledOnce();
    const loggedMessage = consoleSpy.log.mock.calls[0][0];
    expect(loggedMessage).toContain('[INFO]');
    expect(loggedMessage).toContain('Test message');
  });

  it('should log warning messages', () => {
    const logger = new Logger();
    logger.warn('Warning message');

    expect(consoleSpy.warn).toHaveBeenCalledOnce();
    const loggedMessage = consoleSpy.warn.mock.calls[0][0];
    expect(loggedMessage).toContain('[WARN]');
    expect(loggedMessage).toContain('Warning message');
  });

  it('should log error messages', () => {
    const logger = new Logger();
    logger.error('Error message');

    expect(consoleSpy.error).toHaveBeenCalledOnce();
    const loggedMessage = consoleSpy.error.mock.calls[0][0];
    expect(loggedMessage).toContain('[ERROR]');
    expect(loggedMessage).toContain('Error message');
  });

  it('should not log debug messages by default', () => {
    const logger = new Logger();
    logger.debug('Debug message');

    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it('should log debug messages when DEBUG env var is set', () => {
    process.env.DEBUG = '1';
    const logger = new Logger();
    logger.debug('Debug message');

    expect(consoleSpy.log).toHaveBeenCalledOnce();
    const loggedMessage = consoleSpy.log.mock.calls[0][0];
    expect(loggedMessage).toContain('[DEBUG]');
    expect(loggedMessage).toContain('Debug message');
  });
});

describe('Logger - Message Formatting', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should include ISO timestamp in messages', () => {
    const logger = new Logger();
    logger.info('Test');

    const loggedMessage = consoleSpy.mock.calls[0][0];
    // Check for ISO 8601 format (e.g., 2026-01-10T15:30:00.000Z)
    expect(loggedMessage).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });

  it('should include prefix when provided', () => {
    const logger = new Logger('TestPrefix');
    logger.info('Message');

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('[TestPrefix]');
    expect(loggedMessage).toContain('Message');
  });

  it('should not include prefix brackets when no prefix', () => {
    const logger = new Logger();
    logger.info('Message');

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).not.toContain('[]');
    expect(loggedMessage).toContain('[INFO]');
  });

  it('should format additional string arguments', () => {
    const logger = new Logger();
    logger.info('Message', 'arg1', 'arg2');

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('Message arg1 arg2');
  });

  it('should format numeric arguments', () => {
    const logger = new Logger();
    logger.info('Count:', 42, 'and', 3.14);

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('Count: 42 and 3.14');
  });

  it('should JSON stringify object arguments', () => {
    const logger = new Logger();
    const obj = { key: 'value', count: 123 };
    logger.info('Data:', obj);

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('Data: {"key":"value","count":123}');
  });

  it('should handle mixed argument types', () => {
    const logger = new Logger();
    logger.info('Mixed', 'string', 42, { nested: true }, null);

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('Mixed string 42 {"nested":true} null');
  });

  it('should handle messages with no additional arguments', () => {
    const logger = new Logger();
    logger.info('Simple message');

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('Simple message');
    // Should not have trailing space
    expect(loggedMessage).toMatch(/Simple message$/);
  });
});

describe('Logger - Log Levels', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
    delete process.env.DEBUG;
  });

  it('should default to INFO level', () => {
    const logger = new Logger();

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    // DEBUG should not be logged
    expect(consoleSpy.log).toHaveBeenCalledOnce(); // Only info
    expect(consoleSpy.warn).toHaveBeenCalledOnce();
    expect(consoleSpy.error).toHaveBeenCalledOnce();
  });

  it('should respect explicit DEBUG level', () => {
    const logger = new Logger(undefined, LogLevel.DEBUG);

    logger.debug('debug');
    logger.info('info');

    // Both should be logged
    expect(consoleSpy.log).toHaveBeenCalledTimes(2);
  });

  it('should respect explicit WARN level', () => {
    const logger = new Logger(undefined, LogLevel.WARN);

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    // Only warn and error should be logged
    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.warn).toHaveBeenCalledOnce();
    expect(consoleSpy.error).toHaveBeenCalledOnce();
  });

  it('should respect explicit ERROR level', () => {
    const logger = new Logger(undefined, LogLevel.ERROR);

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');
    logger.error('error');

    // Only error should be logged
    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.warn).not.toHaveBeenCalled();
    expect(consoleSpy.error).toHaveBeenCalledOnce();
  });

  it('should allow runtime level changes with setMinLevel', () => {
    const logger = new Logger();

    logger.info('info1');
    expect(consoleSpy.log).toHaveBeenCalledOnce();

    // Change to ERROR level
    logger.setMinLevel(LogLevel.ERROR);
    consoleSpy.log.mockClear();

    logger.info('info2');
    logger.warn('warn');
    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.warn).not.toHaveBeenCalled();

    logger.error('error');
    expect(consoleSpy.error).toHaveBeenCalledOnce();
  });

  it('should return current level with getMinLevel', () => {
    const logger = new Logger(undefined, LogLevel.WARN);

    expect(logger.getMinLevel()).toBe(LogLevel.WARN);

    logger.setMinLevel(LogLevel.DEBUG);
    expect(logger.getMinLevel()).toBe(LogLevel.DEBUG);
  });

  it('should detect DEBUG env var at construction', () => {
    process.env.DEBUG = 'true';
    const logger = new Logger();

    logger.debug('debug message');

    expect(consoleSpy.log).toHaveBeenCalledOnce();
    const message = consoleSpy.log.mock.calls[0][0];
    expect(message).toContain('[DEBUG]');
  });
});

describe('Logger - Edge Cases', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should handle empty string prefix', () => {
    const logger = new Logger('');
    logger.info('Message');

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('[INFO]');
    expect(loggedMessage).not.toContain('[]'); // No empty prefix brackets
  });

  it('should handle prefix with special characters', () => {
    const logger = new Logger('Worker:12345');
    logger.info('Message');

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('[Worker:12345]');
  });

  it('should handle empty message', () => {
    const logger = new Logger();
    logger.info('');

    expect(consoleSpy).toHaveBeenCalledOnce();
    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('[INFO]');
  });

  it('should handle undefined in arguments', () => {
    const logger = new Logger();
    logger.info('Value:', undefined);

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('Value: undefined');
  });

  it('should handle arrays in arguments', () => {
    const logger = new Logger();
    logger.info('List:', [1, 2, 3]);

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('[1,2,3]');
  });

  it('should handle nested objects', () => {
    const logger = new Logger();
    const obj = { outer: { inner: 'value' } };
    logger.info('Data:', obj);

    const loggedMessage = consoleSpy.mock.calls[0][0];
    expect(loggedMessage).toContain('{"outer":{"inner":"value"}}');
  });
});
