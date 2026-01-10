import { type HealthCheckConfig, type RuleType } from "./shared-proxy-config";

/**
 * Standardized proxy rule - used in the processed configuration
 * Normalizes targets to always be an array
 */
export interface StandardizedProxyRule {
    type: RuleType.PROXY;
    targets: string[];
    health_check?: HealthCheckConfig;
}

/**
 * Standardized redirect rule
 */
export interface StandardizedRedirectRule {
    type: RuleType.REDIRECT;
    to: string;
    strip_prefix?: string;
    status: number;
}

/**
 * Standardized rewrite rule
 */
export interface StandardizedRewriteRule {
    type: RuleType.REWRITE;
    to: string;
}

/**
 * Union type for all standardized rules used in the processed configuration
 */
export type ProxyRule = StandardizedProxyRule | StandardizedRedirectRule | StandardizedRewriteRule;

/**
 * Standardized proxy configuration using Maps for O(1) lookups
 * Structure: port (number) -> hostname (string) -> path (string) -> ProxyRule
 * Supports proxy, redirect, and rewrite rule types
 * Uses '*' as wildcard hostname for backward compatibility
 */
export type ProxyConfigMap = Map<number, Map<string, Map<string, ProxyRule>>>;
