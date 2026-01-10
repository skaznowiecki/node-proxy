import { type ProxyConfigMap, type ProxyRule, type StandardizedProxyRule, type StandardizedRedirectRule, type StandardizedRewriteRule } from "@/types/standardized-proxy-config";
import { type RawProxyConfig, type PortConfig, type HostConfig, type RuleConfig } from "@/types/raw-proxy-config";
import { RuleType, type DefaultsConfig, type TLSConfig } from "@/types/shared-proxy-config";

/**
 * Standardized proxy configuration with helper methods
 */
export class ProxyConfig {
    private configMap: ProxyConfigMap;
    private defaultsConfig?: DefaultsConfig;
    private tlsConfigMap: Map<number, TLSConfig>;

    constructor(configMap: ProxyConfigMap, defaultsConfig?: DefaultsConfig, tlsConfigMap?: Map<number, TLSConfig>) {
        this.configMap = configMap;
        this.defaultsConfig = defaultsConfig;
        this.tlsConfigMap = tlsConfigMap ?? new Map();
    }

    /**
     * Load raw proxy configuration from a JSON string and convert to ProxyConfig
     * @param configContent - JSON string content of the configuration file
     * @returns ProxyConfig instance
     * @throws Error if content cannot be parsed
     */
    static loadFromString(configContent: string): ProxyConfig {
        try {
            const rawConfig = JSON.parse(configContent) as RawProxyConfig;
            return ProxyConfig.fromRawConfig(rawConfig);
        } catch (error) {
            throw new Error(
                `Failed to parse proxy configuration: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Parse port string to number
     * @param portStr - Port string (e.g., "80")
     * @returns Port number
     * @throws Error if port is invalid
     */
    private static parsePort(portStr: string): number {
        const port = parseInt(portStr, 10);

        if (isNaN(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid port: ${portStr}. Port must be a number between 1 and 65535`);
        }

        return port;
    }

    /**
     * Convert raw proxy configuration to standardized ProxyConfig
     * @param rawConfig - Raw configuration from JSON file
     * @returns ProxyConfig instance
     */
    static fromRawConfig(rawConfig: RawProxyConfig): ProxyConfig {
        const configMap: ProxyConfigMap = new Map();
        const tlsConfigMap: Map<number, TLSConfig> = new Map();
        const defaultsConfig = rawConfig.__defaults;

        for (const [key, value] of Object.entries(rawConfig)) {
            // Skip __defaults key
            if (key === '__defaults') {
                continue;
            }

            const portStr = key;
            let port: number;
            try {
                port = ProxyConfig.parsePort(portStr);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn(`Skipping invalid port: ${portStr} - ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }

            const portConfig: PortConfig = value as PortConfig;

            // Handle simple string URL (port -> URL)
            // Routes all hosts on this port to the same backend
            if (typeof portConfig === 'string') {
                const pathMap = new Map<string, ProxyRule>();
                pathMap.set('*', {
                    type: RuleType.PROXY,
                    targets: [portConfig],
                });
                const hostMap = new Map<string, Map<string, ProxyRule>>();
                hostMap.set('*', pathMap);
                configMap.set(port, hostMap);
                continue;
            }

            // Extract TLS configuration if present (reserved key)
            if ('tls' in portConfig && portConfig.tls) {
                tlsConfigMap.set(port, portConfig.tls);
            }

            // Check if this port config has "hosts" key (virtual host routing)
            if (typeof portConfig === 'object' && portConfig !== null && 'hosts' in portConfig) {
                // Parse virtual host configuration
                const hostsConfig = (portConfig as { hosts: Record<string, HostConfig> }).hosts;
                const hostMap = new Map<string, Map<string, ProxyRule>>();

                for (const [hostname, hostValue] of Object.entries(hostsConfig)) {
                    // Parse each hostname's configuration
                    const pathMap = ProxyConfig.parseHostConfig(hostname, hostValue);
                    hostMap.set(hostname, pathMap);
                }

                configMap.set(port, hostMap);
                continue;
            }

            // Handle path mappings (port -> { path: ... })
            // Routes all hosts on this port with path-based routing
            // Internally uses '*' wildcard for hostname
            // Skip 'tls' key when parsing path mappings
            const pathMappings: Record<string, string | RuleConfig> = {};
            for (const [pathKey, pathValue] of Object.entries(portConfig)) {
                if (pathKey !== 'tls') {
                    pathMappings[pathKey] = pathValue as string | RuleConfig;
                }
            }
            const pathMap = ProxyConfig.parseHostConfig('*', pathMappings);
            const hostMap = new Map<string, Map<string, ProxyRule>>();
            hostMap.set('*', pathMap);
            configMap.set(port, hostMap);
        }

        return new ProxyConfig(configMap, defaultsConfig, tlsConfigMap);
    }

    /**
     * Parse host configuration (hostname -> paths -> rules)
     * @param hostname - Hostname for logging/debugging
     * @param hostValue - Host configuration value (string URL or path mappings)
     * @returns Map of path -> ProxyRule
     */
    private static parseHostConfig(hostname: string, hostValue: HostConfig): Map<string, ProxyRule> {
        const pathMap = new Map<string, ProxyRule>();

        // Handle simple string URL (hostname -> URL)
        if (typeof hostValue === 'string') {
            pathMap.set('*', {
                type: RuleType.PROXY,
                targets: [hostValue],
            });
            return pathMap;
        }

        // Handle path mappings (hostname -> { path: ... })
        for (const [path, pathValue] of Object.entries(hostValue)) {
            if (typeof pathValue === 'string') {
                pathMap.set(path, {
                    type: RuleType.PROXY,
                    targets: [pathValue],
                });
            } else {
                const rule = ProxyConfig.normalizeRule(pathValue);
                if (rule) {
                    pathMap.set(path, rule);
                }
            }
        }

        return pathMap;
    }

    /**
     * Normalize a rule configuration to a standardized rule
     * @param ruleConfig - Raw rule configuration
     * @returns Standardized rule or undefined if invalid
     */
    private static normalizeRule(ruleConfig: RuleConfig): ProxyRule | undefined {
        // Handle proxy rule
        if (!ruleConfig.type || ruleConfig.type === RuleType.PROXY) {
            const proxyRule = ruleConfig;
            const targets = Array.isArray(proxyRule.to) ? proxyRule.to : [proxyRule.to];
            const standardizedRule: StandardizedProxyRule = {
                type: RuleType.PROXY,
                targets,
                health_check: proxyRule.health_check,
            };
            return standardizedRule;
        }

        // Handle redirect rule
        if (ruleConfig.type === RuleType.REDIRECT) {
            const redirectRule = ruleConfig;
            const standardizedRule: StandardizedRedirectRule = {
                type: RuleType.REDIRECT,
                to: redirectRule.to,
                strip_prefix: redirectRule.strip_prefix,
                status: redirectRule.status ?? 302,
            };
            return standardizedRule;
        }

        // Handle rewrite rule
        if (ruleConfig.type === RuleType.REWRITE) {
            const rewriteRule = ruleConfig;
            const standardizedRule: StandardizedRewriteRule = {
                type: RuleType.REWRITE,
                to: rewriteRule.to,
            };
            return standardizedRule;
        }

        return undefined;
    }

    /**
     * Get proxy rule for a specific port, hostname, and path
     * Falls back to '*' wildcard hostname and path if exact match not found
     * @param port - Port number (e.g., 80)
     * @param hostname - Hostname from Host header (e.g., "myshop.local")
     * @param path - Request path (e.g., "/api")
     * @returns ProxyRule if found (exact match or '*' fallback), undefined otherwise
     */
    getRule(port: number, hostname: string, path: string): ProxyRule | undefined {
        const hostMap = this.configMap.get(port);
        if (!hostMap) {
            return undefined;
        }

        // Try exact hostname match, fallback to wildcard if not found
        let pathMap = hostMap.get(hostname);
        pathMap ??= hostMap.get('*');

        if (!pathMap) {
            return undefined;
        }

        // Try exact path match
        const exactRule = pathMap.get(path);
        if (exactRule) {
            return exactRule;
        }

        // Fallback to '*' wildcard path
        return pathMap.get('*');
    }

    /**
     * Check if a port exists in the configuration
     */
    hasPort(port: number): boolean {
        return this.configMap.has(port);
    }

    /**
     * Check if a path exists for a specific port
     * Returns true if exact path exists or '*' fallback exists across any hostname
     */
    hasPath(port: number, path: string): boolean {
        const hostMap = this.configMap.get(port);
        if (!hostMap) {
            return false;
        }
        // Check if any hostname has the exact path or '*' fallback
        for (const pathMap of hostMap.values()) {
            if (pathMap.has(path) || pathMap.has('*')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get all ports in the configuration
     */
    getPorts(): number[] {
        return Array.from(this.configMap.keys());
    }

    /**
     * Get all unique paths for a specific port across all hostnames
     */
    getPaths(port: number): string[] {
        const hostMap = this.configMap.get(port);
        if (!hostMap) {
            return [];
        }
        // Collect all unique paths across all hostnames
        const paths = new Set<string>();
        for (const pathMap of hostMap.values()) {
            for (const path of pathMap.keys()) {
                paths.add(path);
            }
        }
        return Array.from(paths);
    }

    /**
     * Get the underlying map structure
     */
    getMap(): ProxyConfigMap {
        return this.configMap;
    }

    /**
     * Get the default configuration settings
     * @returns DefaultsConfig if available, undefined otherwise
     */
    getDefaults(): DefaultsConfig | undefined {
        return this.defaultsConfig;
    }

    /**
     * Get TLS configuration for a specific port
     * @param port - Port number
     * @returns TLSConfig if configured for this port, undefined otherwise
     */
    getTLSConfig(port: number): TLSConfig | undefined {
        return this.tlsConfigMap.get(port);
    }
}

