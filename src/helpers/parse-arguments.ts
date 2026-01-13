import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Command types for daemon operations
 */
export enum Command {
    START = 'start',
    STOP = 'stop',
    RESTART = 'restart',
    STATUS = 'status',
    VALIDATE = 'validate',
}

/**
 * Parsed arguments structure
 */
export interface ParsedArguments {
    command: Command;
    rulesPath: string;
    pidFile?: string;
    internalDaemon?: boolean;
}

/**
 * Parse command-line arguments
 * @returns Parsed arguments object
 * @throws Error if required arguments are missing or invalid
 */
export function parseArguments(): ParsedArguments {
    const args = process.argv.slice(2);

    // Check for command (start, stop, restart, status)
    let command: Command | undefined;
    let rulesPath = '';
    let pidFile: string | undefined;
    let internalDaemon = false;

    // Check for command
    if (args.length > 0 && !args[0].startsWith('--')) {
        const cmd = args[0].toLowerCase();
        if (Object.values(Command).includes(cmd as Command)) {
            command = cmd as Command;
            args.shift(); // Remove command from args
        }
    }

    // Parse flags
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--rules' && i + 1 < args.length) {
            rulesPath = args[i + 1];
            i++; // Skip next arg
        } else if (arg === '--pid-file' && i + 1 < args.length) {
            pidFile = args[i + 1];
            i++; // Skip next arg
        } else if (arg.startsWith('--rules=')) {
            rulesPath = arg.substring(8);
        } else if (arg.startsWith('--pid-file=')) {
            pidFile = arg.substring(12);
        } else if (arg === '--internal-daemon-process') {
            internalDaemon = true;
        }
    }

    // Command is required
    if (!command) {
        throw new Error('Command is required. Available commands: start, stop, restart, status, validate');
    }

    // For start/restart/validate commands, rules path is required
    if ((command === Command.START || command === Command.RESTART || command === Command.VALIDATE) && !rulesPath) {
        // Try default rules.json
        const defaultRulesPath = join(process.cwd(), 'rules.json');
        if (existsSync(defaultRulesPath)) {
            rulesPath = defaultRulesPath;
        } else {
            throw new Error('Missing required argument: --rules <path>');
        }
    }

    return {
        command,
        rulesPath,
        pidFile,
        internalDaemon,
    };
}