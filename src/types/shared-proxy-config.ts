/**
 * Rule type for proxy configuration rules
 */
export enum RuleType {
    PROXY = 'proxy',
    REDIRECT = 'redirect',
    REWRITE = 'rewrite',
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
    path: string;
    interval_ms: number;
    timeout_ms: number;
    expect_status: number[];
}

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
 * TLS/SSL configuration
 */
export interface TLSConfig {
    cert: string;      // Path to certificate file (PEM format)
    key: string;       // Path to private key file (PEM format)
    ca?: string;       // Optional CA bundle path (PEM format)
}

/**
 * Default configuration settings
 */
export interface DefaultsConfig {
    timeout_ms?: number;
    retries?: RetryConfig;
    headers?: HeadersConfig;
}
