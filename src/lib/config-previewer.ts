import type { ProxyConfig } from '@/lib/proxy-config';
import { RuleType } from '@/types/shared-proxy-config';
import type { ProxyRule } from '@/types/standardized-proxy-config';

/**
 * Preview rendering options
 */
export interface PreviewOptions {
    colorize?: boolean; // Use ANSI colors (default: true if TTY)
    compact?: boolean; // Compact view without details
}

/**
 * ANSI color codes
 */
const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
};

/**
 * Configuration previewer - renders config as tree structure
 */
export class ConfigPreviewer {
    private colorize: boolean;
    private compact: boolean;

    constructor(options: PreviewOptions = {}) {
        // Default to colorize if stdout is a TTY
        this.colorize = options.colorize ?? (process.stdout.isTTY ?? false);
        this.compact = options.compact ?? false;
    }

    /**
     * Generate preview of configuration
     */
    preview(config: ProxyConfig): string {
        const lines: string[] = [];

        // Title
        lines.push('Configuration Preview');
        lines.push('='.repeat(21));
        lines.push('');

        const ports = config.getPorts();
        const configMap = config.getMap();
        let totalHosts = 0;
        let totalRules = 0;

        // Render each port
        for (let i = 0; i < ports.length; i++) {
            const port = ports[i];
            const hostMap = configMap.get(port);
            const isLast = i === ports.length - 1;

            if (!hostMap) continue;

            // Count hosts and rules
            const hosts = Array.from(hostMap.keys());
            totalHosts += hosts.length;

            for (const pathMap of hostMap.values()) {
                totalRules += pathMap.size;
            }

            // Render port
            const portLine = this.renderPort(port, hostMap);
            lines.push(portLine);

            // Render hosts
            for (let j = 0; j < hosts.length; j++) {
                const hostname = hosts[j];
                const pathMap = hostMap.get(hostname);
                const isLastHost = j === hosts.length - 1;

                if (!pathMap) continue;

                lines.push(...this.renderHost(hostname, pathMap, isLastHost && isLast));
            }

            // Add blank line between ports
            if (!isLast) {
                lines.push('');
            }
        }

        // Summary
        lines.push('');
        lines.push(
            this.color(
                `Summary: ${ports.length} port${ports.length !== 1 ? 's' : ''}, ${totalHosts} host${totalHosts !== 1 ? 's' : ''}, ${totalRules} rule${totalRules !== 1 ? 's' : ''}`,
                'gray'
            )
        );

        return lines.join('\n');
    }

    /**
     * Render a port line
     */
    private renderPort(port: number, _hostMap: Map<string, Map<string, ProxyRule>>): string {
        // Note: TLS configuration is per-port, not per-rule
        // For now, we just show the port without TLS indication
        const portStr = this.color(`Port ${port}`, 'cyan');
        return `${portStr}`;
    }

    /**
     * Render a host and its paths
     */
    private renderHost(
        hostname: string,
        pathMap: Map<string, ProxyRule>,
        isLastInConfig: boolean
    ): string[] {
        const lines: string[] = [];

        // Host line
        const displayName = hostname === '*' ? '* (all hosts)' : hostname;
        const hostLine = this.color(displayName, 'yellow');
        lines.push(`+-- Host: ${hostLine}`);

        // Render paths
        const paths = Array.from(pathMap.keys());
        for (let i = 0; i < paths.length; i++) {
            const path = paths[i];
            const rule = pathMap.get(path);
            const isLastPath = i === paths.length - 1;

            if (!rule) continue;

            lines.push(...this.renderPath(path, rule, isLastPath, isLastInConfig && isLastPath));
        }

        return lines;
    }

    /**
     * Render a path and its rule
     */
    private renderPath(path: string, rule: ProxyRule, isLastPath: boolean, isLastInConfig: boolean): string[] {
        const lines: string[] = [];

        // Tree characters
        const connector = isLastPath ? '+--' : '+--';
        const indent = isLastPath && isLastInConfig ? '    ' : '|   ';

        // Path line
        const pathLine = this.color(path, 'green');
        lines.push(`${indent}${connector} Path: ${pathLine}`);

        // Rule details
        const ruleLines = this.renderRule(rule);
        for (let i = 0; i < ruleLines.length; i++) {
            const isLastRuleLine = i === ruleLines.length - 1;
            const ruleConnector = isLastRuleLine && !this.compact ? '    ' : '|   ';
            const finalIndent = isLastPath && isLastInConfig ? '        ' : `${indent}${ruleConnector}`;
            lines.push(`${finalIndent}${ruleLines[i]}`);
        }

        return lines;
    }

    /**
     * Render rule details
     */
    private renderRule(rule: ProxyRule): string[] {
        const lines: string[] = [];

        switch (rule.type) {
            case RuleType.PROXY: {
                const typeLabel = this.color('[PROXY]', 'blue');
                const targets = rule.targets.join(', ');
                lines.push(`+-- ${typeLabel} -> ${targets}`);

                if (!this.compact) {
                    if (rule.targets.length > 1) {
                        lines.push(
                            `    ${this.color(`(load balanced, ${rule.targets.length} targets)`, 'gray')}`
                        );
                    }
                    if (rule.health_check) {
                        lines.push(
                            `    ${this.color(`(health check: ${rule.health_check.path})`, 'gray')}`
                        );
                    }
                }
                break;
            }

            case RuleType.REDIRECT: {
                const typeLabel = this.color(`[REDIRECT ${rule.status}]`, 'magenta');
                lines.push(`+-- ${typeLabel} -> ${rule.to}`);

                if (!this.compact && rule.strip_prefix) {
                    lines.push(`    ${this.color(`(strip_prefix: ${rule.strip_prefix})`, 'gray')}`);
                }
                break;
            }

            case RuleType.REWRITE: {
                const typeLabel = this.color('[REWRITE]', 'white');
                lines.push(`+-- ${typeLabel} -> ${rule.to}`);
                break;
            }
        }

        return lines;
    }

    /**
     * Apply color to text if colorize is enabled
     */
    private color(text: string, colorName: keyof typeof colors): string {
        if (!this.colorize) return text;
        return `${colors[colorName]}${text}${colors.reset}`;
    }
}
