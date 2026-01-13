import { ProxyConfig } from '@/lib/proxy-config';
import { RuleType } from '@/types/shared-proxy-config';
import type { RawProxyConfig, RuleConfig } from '@/types/raw-proxy-config';

/**
 * Validation error/warning information
 */
export interface ValidationError {
    code: string;
    message: string;
    path: string;
    severity: 'error' | 'warning';
}

/**
 * Result of configuration validation
 */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    config?: ProxyConfig;
}

/**
 * Comprehensive configuration validator
 */
export class ConfigValidator {
    /**
     * Validate a configuration string
     */
    validate(configContent: string): ValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationError[] = [];

        // Step 1: Validate JSON syntax
        const jsonError = this.validateJsonSyntax(configContent);
        if (jsonError) {
            return {
                valid: false,
                errors: [jsonError],
                warnings: [],
            };
        }

        // Parse JSON (we know it's valid at this point)
        const rawConfig = JSON.parse(configContent) as RawProxyConfig;

        // Step 2: Validate ports
        errors.push(...this.validatePorts(rawConfig));

        // Step 3: Validate URLs
        errors.push(...this.validateUrls(rawConfig));

        // Step 4: Validate rule types
        errors.push(...this.validateRuleTypes(rawConfig));

        // Step 5: Validate required fields
        errors.push(...this.validateRequiredFields(rawConfig));

        // Step 6: Validate redirect status codes
        warnings.push(...this.validateRedirectStatus(rawConfig));

        // Step 7: Detect shadowed rules
        warnings.push(...this.detectShadowedRules(rawConfig));

        // Step 8: Check for empty configuration
        if (Object.keys(rawConfig).filter((k) => k !== '__defaults').length === 0) {
            warnings.push({
                code: 'EMPTY_CONFIG',
                message: 'Configuration has no ports defined',
                path: '$',
                severity: 'warning',
            });
        }

        // If no errors, try to load the config
        let config: ProxyConfig | undefined;
        if (errors.length === 0) {
            try {
                config = ProxyConfig.loadFromString(configContent);
            } catch (error) {
                errors.push({
                    code: 'CONFIG_LOAD_FAILED',
                    message: `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
                    path: '$',
                    severity: 'error',
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            config,
        };
    }

    /**
     * Validate JSON syntax
     */
    private validateJsonSyntax(content: string): ValidationError | null {
        try {
            JSON.parse(content);
            return null;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                code: 'INVALID_JSON',
                message: `Invalid JSON syntax: ${message}`,
                path: '$',
                severity: 'error',
            };
        }
    }

    /**
     * Validate port numbers
     */
    private validatePorts(rawConfig: RawProxyConfig): ValidationError[] {
        const errors: ValidationError[] = [];

        for (const portStr of Object.keys(rawConfig)) {
            if (portStr === '__defaults') continue;

            const port = parseInt(portStr, 10);
            if (isNaN(port)) {
                errors.push({
                    code: 'INVALID_PORT',
                    message: `Port must be a number, got: ${portStr}`,
                    path: portStr,
                    severity: 'error',
                });
            } else if (port < 1 || port > 65535) {
                errors.push({
                    code: 'INVALID_PORT',
                    message: `Port must be between 1 and 65535, got: ${port}`,
                    path: portStr,
                    severity: 'error',
                });
            }
        }

        return errors;
    }

    /**
     * Validate URLs in target configurations
     */
    private validateUrls(rawConfig: RawProxyConfig): ValidationError[] {
        const errors: ValidationError[] = [];

        for (const [portStr, portConfig] of Object.entries(rawConfig)) {
            if (portStr === '__defaults' || !portConfig) continue;

            // Simple string config: port -> URL
            if (typeof portConfig === 'string') {
                const error = this.validateTargetUrl(portConfig, portStr);
                if (error) errors.push(error);
                continue;
            }

            // Virtual host configuration
            if ('hosts' in portConfig && portConfig.hosts) {
                for (const [hostname, hostConfig] of Object.entries(portConfig.hosts)) {
                    if (typeof hostConfig === 'string') {
                        const error = this.validateTargetUrl(hostConfig, `${portStr}.hosts.${hostname}`);
                        if (error) errors.push(error);
                    } else {
                        // Path-based routing
                        for (const [path, rule] of Object.entries(hostConfig)) {
                            errors.push(...this.validateRuleUrls(rule as string | RuleConfig, `${portStr}.hosts.${hostname}.${path}`));
                        }
                    }
                }
                continue;
            }

            // Path-based routing (no virtual hosts)
            for (const [path, rule] of Object.entries(portConfig as Record<string, string | RuleConfig>)) {
                if (path === 'tls') continue; // Skip TLS config
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                errors.push(...this.validateRuleUrls(rule as string | RuleConfig, `${portStr}.${path}`));
            }
        }

        return errors;
    }

    /**
     * Validate URLs in a rule configuration
     */
    private validateRuleUrls(rule: string | RuleConfig, path: string): ValidationError[] {
        const errors: ValidationError[] = [];

        if (typeof rule === 'string') {
            // Skip URL validation for empty strings (handled by required fields validation)
            if (rule === '') return errors;
            const error = this.validateTargetUrl(rule, path);
            if (error) errors.push(error);
            return errors;
        }

        // Rule must be an object to have properties
        if (typeof rule !== 'object' || rule === null) {
            return errors;
        }

        // Rule is an object
        if ('to' in rule) {
            const to = rule.to;
            if (typeof to === 'string') {
                // Skip URL validation for empty strings (handled by required fields validation)
                if (to === '') return errors;
                // For redirect and rewrite rules, 'to' might be a path, not a URL
                if (rule.type === 'redirect' && !to.startsWith('http://') && !to.startsWith('https://')) {
                    // Allow relative URLs for redirects
                    return errors;
                }
                if (rule.type === 'rewrite') {
                    // Rewrite rules use paths, not URLs
                    return errors;
                }
                const error = this.validateTargetUrl(to, `${path}.to`);
                if (error) errors.push(error);
            } else if (Array.isArray(to)) {
                // Skip if array is empty (handled by required fields validation)
                if (to.length === 0) return errors;
                for (let i = 0; i < to.length; i++) {
                    const error = this.validateTargetUrl(to[i], `${path}.to[${i}]`);
                    if (error) errors.push(error);
                }
            }
        }

        return errors;
    }

    /**
     * Validate a single target URL
     */
    private validateTargetUrl(urlString: string, path: string): ValidationError | null {
        try {
            const url = new URL(urlString);

            // Must be http or https
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                return {
                    code: 'INVALID_PROTOCOL',
                    message: `URL must use http:// or https:// protocol, got: ${url.protocol}`,
                    path,
                    severity: 'error',
                };
            }

            // Must have a hostname
            if (!url.hostname) {
                return {
                    code: 'MISSING_HOSTNAME',
                    message: 'URL must have a hostname',
                    path,
                    severity: 'error',
                };
            }

            return null;
        } catch {
            return {
                code: 'INVALID_URL',
                message: `Invalid URL format: ${urlString}`,
                path,
                severity: 'error',
            };
        }
    }

    /**
     * Validate rule types
     */
    private validateRuleTypes(rawConfig: RawProxyConfig): ValidationError[] {
        const errors: ValidationError[] = [];
        const validTypes = [RuleType.PROXY, RuleType.REDIRECT, RuleType.REWRITE];

        for (const [portStr, portConfig] of Object.entries(rawConfig)) {
            if (portStr === '__defaults' || !portConfig || typeof portConfig === 'string') continue;

            if ('hosts' in portConfig && portConfig.hosts) {
                for (const [hostname, hostConfig] of Object.entries(portConfig.hosts)) {
                    if (typeof hostConfig !== 'string') {
                        for (const [path, rule] of Object.entries(hostConfig)) {
                            if (typeof rule === 'object' && rule && 'type' in rule) {
                                if (!validTypes.includes(rule.type as RuleType)) {
                                    errors.push({
                                        code: 'INVALID_RULE_TYPE',
                                        message: `Invalid rule type: ${rule.type}. Must be one of: ${validTypes.join(', ')}`,
                                        path: `${portStr}.hosts.${hostname}.${path}.type`,
                                        severity: 'error',
                                    });
                                }
                            }
                        }
                    }
                }
                continue;
            }

            for (const [path, rule] of Object.entries(portConfig as Record<string, string | RuleConfig>)) {
                if (path === 'tls') continue; // Skip TLS config
                if (typeof rule === 'object' && rule && 'type' in rule && 'to' in rule) {
                    if (!validTypes.includes(rule.type as RuleType)) {
                        errors.push({
                            code: 'INVALID_RULE_TYPE',
                            message: `Invalid rule type: ${rule.type}. Must be one of: ${validTypes.join(', ')}`,
                            path: `${portStr}.${path}.type`,
                            severity: 'error',
                        });
                    }
                }
            }
        }

        return errors;
    }

    /**
     * Validate required fields for each rule type
     */
    private validateRequiredFields(rawConfig: RawProxyConfig): ValidationError[] {
        const errors: ValidationError[] = [];

        for (const [portStr, portConfig] of Object.entries(rawConfig)) {
            if (portStr === '__defaults' || !portConfig || typeof portConfig === 'string') continue;

            if ('hosts' in portConfig && portConfig.hosts) {
                for (const [hostname, hostConfig] of Object.entries(portConfig.hosts)) {
                    if (typeof hostConfig !== 'string') {
                        for (const [path, rule] of Object.entries(hostConfig)) {
                            const error = this.validateRuleRequiredFields(rule as string | RuleConfig, `${portStr}.hosts.${hostname}.${path}`);
                            if (error) errors.push(error);
                        }
                    }
                }
                continue;
            }

            for (const [path, rule] of Object.entries(portConfig as Record<string, string | RuleConfig>)) {
                if (path === 'tls') continue; // Skip TLS config
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                const error = this.validateRuleRequiredFields(rule as string | RuleConfig, `${portStr}.${path}`);
                if (error) errors.push(error);
            }
        }

        return errors;
    }

    /**
     * Validate required fields for a single rule
     */
    private validateRuleRequiredFields(rule: string | RuleConfig, path: string): ValidationError | null {
        if (typeof rule === 'string') {
            // String rules are always valid (they are the target URL)
            return null;
        }

        // Rule must be an object to have properties
        if (typeof rule !== 'object' || rule === null) {
            return null;
        }

        // Rule is an object - must have 'to' field
        if (!('to' in rule)) {
            return {
                code: 'MISSING_REQUIRED_FIELD',
                message: 'Rule must have a "to" field',
                path,
                severity: 'error',
            };
        }

        // Validate 'to' field is not empty
        if (rule.to === '' || (Array.isArray(rule.to) && rule.to.length === 0)) {
            return {
                code: 'EMPTY_TARGET',
                message: 'Rule "to" field cannot be empty',
                path: `${path}.to`,
                severity: 'error',
            };
        }

        return null;
    }

    /**
     * Validate redirect status codes
     */
    private validateRedirectStatus(rawConfig: RawProxyConfig): ValidationError[] {
        const warnings: ValidationError[] = [];
        const validStatuses = [301, 302, 307, 308];

        for (const [portStr, portConfig] of Object.entries(rawConfig)) {
            if (portStr === '__defaults' || !portConfig || typeof portConfig === 'string') continue;

            if ('hosts' in portConfig && portConfig.hosts) {
                for (const [hostname, hostConfig] of Object.entries(portConfig.hosts)) {
                    if (typeof hostConfig !== 'string') {
                        for (const [path, rule] of Object.entries(hostConfig)) {
                            if (typeof rule === 'object' && rule && 'type' in rule && rule.type === 'redirect' && 'status' in rule) {
                                if (!validStatuses.includes(rule.status as number)) {
                                    warnings.push({
                                        code: 'INVALID_REDIRECT_STATUS',
                                        message: `Redirect status should be one of: ${validStatuses.join(', ')}. Got: ${rule.status}`,
                                        path: `${portStr}.hosts.${hostname}.${path}.status`,
                                        severity: 'warning',
                                    });
                                }
                            }
                        }
                    }
                }
                continue;
            }

            for (const [path, rule] of Object.entries(portConfig as Record<string, string | RuleConfig>)) {
                if (path === 'tls') continue; // Skip TLS config
                if (typeof rule === 'object' && rule && 'type' in rule && rule.type === 'redirect' && 'status' in rule) {
                    if (!validStatuses.includes(rule.status as number)) {
                        warnings.push({
                            code: 'INVALID_REDIRECT_STATUS',
                            message: `Redirect status should be one of: ${validStatuses.join(', ')}. Got: ${rule.status}`,
                            path: `${portStr}.${path}.status`,
                            severity: 'warning',
                        });
                    }
                }
            }
        }

        return warnings;
    }

    /**
     * Detect shadowed/unreachable rules
     */
    private detectShadowedRules(rawConfig: RawProxyConfig): ValidationError[] {
        const warnings: ValidationError[] = [];

        for (const [portStr, portConfig] of Object.entries(rawConfig)) {
            if (portStr === '__defaults' || !portConfig || typeof portConfig === 'string') continue;

            // Check virtual host shadowing
            if ('hosts' in portConfig && portConfig.hosts) {
                const hostKeys = Object.keys(portConfig.hosts);
                const wildcardIndex = hostKeys.indexOf('*');

                if (wildcardIndex !== -1 && wildcardIndex < hostKeys.length - 1) {
                    warnings.push({
                        code: 'SHADOWED_HOST',
                        message: 'Wildcard host "*" appears before specific hosts, which may never be reached',
                        path: `${portStr}.hosts.*`,
                        severity: 'warning',
                    });
                }

                // Check path shadowing within each host
                for (const [hostname, hostConfig] of Object.entries(portConfig.hosts)) {
                    if (typeof hostConfig !== 'string') {
                        const pathKeys = Object.keys(hostConfig);
                        const pathWildcardIndex = pathKeys.indexOf('*');

                        if (pathWildcardIndex !== -1 && pathWildcardIndex < pathKeys.length - 1) {
                            warnings.push({
                                code: 'SHADOWED_PATH',
                                message: 'Wildcard path "*" appears before specific paths, which may never be reached',
                                path: `${portStr}.hosts.${hostname}.*`,
                                severity: 'warning',
                            });
                        }
                    }
                }
            } else {
                // Check path shadowing (no virtual hosts)
                const pathKeys = Object.keys(portConfig as Record<string, unknown>);
                const wildcardIndex = pathKeys.indexOf('*');

                if (wildcardIndex !== -1 && wildcardIndex < pathKeys.length - 1) {
                    warnings.push({
                        code: 'SHADOWED_PATH',
                        message: 'Wildcard path "*" appears before specific paths, which may never be reached',
                        path: `${portStr}.*`,
                        severity: 'warning',
                    });
                }
            }
        }

        return warnings;
    }
}
