/**
 * Log levels enum
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

/**
 * Logger class for standardized logging
 */
export class Logger {
    private prefix: string;
    private minLevel: LogLevel;

    constructor(prefix?: string, minLevel?: LogLevel) {
        this.prefix = prefix ?? '';
        // Default to INFO level, or DEBUG if DEBUG env var is set
        this.minLevel = minLevel ?? (process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO);
    }

    /**
     * Format log message with timestamp and level
     */
    private formatMessage(level: string, message: string, ...args: unknown[]): string {
        const timestamp = new Date().toISOString();
        const prefix = this.prefix ? `[${this.prefix}] ` : '';
        const argsStr = args.length > 0 ? ' ' + args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ') : '';
        return `${timestamp} [${level}] ${prefix}${message}${argsStr}`;
    }

    /**
     * Log debug message (only shown if DEBUG env var is set or minLevel is DEBUG)
     */
    debug(message: string, ...args: unknown[]): void {
        if (this.minLevel <= LogLevel.DEBUG) {
            // eslint-disable-next-line no-console
            console.log(this.formatMessage('DEBUG', message, ...args));
        }
    }

    /**
     * Log info message
     */
    info(message: string, ...args: unknown[]): void {
        if (this.minLevel <= LogLevel.INFO) {
            // eslint-disable-next-line no-console
            console.log(this.formatMessage('INFO', message, ...args));
        }
    }

    /**
     * Log warning message
     */
    warn(message: string, ...args: unknown[]): void {
        if (this.minLevel <= LogLevel.WARN) {
            // eslint-disable-next-line no-console
            console.warn(this.formatMessage('WARN', message, ...args));
        }
    }

    /**
     * Log error message
     */
    error(message: string, ...args: unknown[]): void {
        if (this.minLevel <= LogLevel.ERROR) {
            // eslint-disable-next-line no-console
            console.error(this.formatMessage('ERROR', message, ...args));
        }
    }

    /**
     * Set minimum log level
     */
    setMinLevel(level: LogLevel): void {
        this.minLevel = level;
    }

    /**
     * Get current minimum log level
     */
    getMinLevel(): LogLevel {
        return this.minLevel;
    }
}

