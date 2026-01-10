import { type DefaultsConfig, type HealthCheckConfig, type RuleType, type TLSConfig } from "./shared-proxy-config";

/**
 * Retry configuration
 */
export interface RetryConfig {
    attempts: number;
    backoff_ms: number;
}

/**
 * Headers configuration
 */
export interface HeadersConfig {
    x_forwarded?: boolean;
    pass_host?: boolean;
}

/**
 * Proxy rule configuration
 */
export interface ProxyRuleConfig {
    type?: RuleType.PROXY | undefined;
    to: string | string[];
    health_check?: HealthCheckConfig;
}

/**
 * Redirect rule configuration
 */
export interface RedirectRuleConfig {
    type: RuleType.REDIRECT;
    to: string;
    strip_prefix?: string;
    status?: number;
}

/**
 * Rewrite rule configuration
 */
export interface RewriteRuleConfig {
    type: RuleType.REWRITE;
    to: string;
}

/**
 * Union type for all rule configurations
 */
export type RuleConfig = ProxyRuleConfig | RedirectRuleConfig | RewriteRuleConfig;

/**
 * Host configuration - can be a simple string URL or an object with path mappings
 */
export type HostConfig =
    | string
    | {
        [path: string]: string | RuleConfig;
    };

/**
 * Port configuration with virtual hosts (hosts key is reserved)
 */
export interface PortConfigWithHosts {
    tls?: TLSConfig;  // Optional TLS configuration
    hosts: {
        [hostname: string]: HostConfig;
    };
}

/**
 * Port configuration with path mappings (path keys starting with / or *)
 * Can also include TLS configuration (tls key is reserved)
 */
export interface PortConfigWithPaths {
    tls?: TLSConfig;  // Optional TLS configuration
    [path: string]: string | RuleConfig | TLSConfig | undefined;
}

/**
 * Port configuration - can be:
 * - Simple string URL (routes all hosts to same backend)
 * - Object with "hosts" key for virtual host routing (with optional TLS)
 * - Object with path mappings (routes all hosts with path-based routing, with optional TLS)
 *
 * Reserved keys: "hosts", "tls"
 */
export type PortConfig =
    | string
    | PortConfigWithHosts
    | PortConfigWithPaths;

/**
 * Raw proxy configuration as loaded from JSON file
 * Supports all use cases:
 * - Simple port -> URL string (basic.json)
 * - Port -> path -> URL string (path.json)
 * - Port -> path -> object with to array (multi-hosts.json)
 * - Port -> path -> object with health_check (health-check.json)
 * - Port -> path -> redirect config (redirect.json)
 * - Port -> path -> rewrite config (rewrite.json)
 * - Special __defaults key (defaults.json)
 */
export interface RawProxyConfig {
    __defaults?: DefaultsConfig;
    [port: string]: PortConfig | DefaultsConfig | undefined;
}
