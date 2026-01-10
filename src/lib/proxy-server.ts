import { createServer as createHttpServer, type IncomingMessage, type ServerResponse, type Server, Agent as HttpAgent } from 'http';
import { createServer as createHttpsServer, type Server as HttpsServer, Agent as HttpsAgent } from 'https';
import { type ProxyConfig } from './proxy-config';
import { type StandardizedProxyRule, type StandardizedRedirectRule, type StandardizedRewriteRule } from '@/types/standardized-proxy-config';
import { RuleType } from '@/types/shared-proxy-config';
import { type ServerConfig } from '@/types/server-config';
import { Logger } from '@/helpers/logger';
import { request as httpRequest, type RequestOptions } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';
import cluster from 'cluster';
import { cpus } from 'os';
import { readFileSync } from 'fs';

/**
 * Proxy server that listens on configured ports and follows rules
 */
export class ProxyServer {
    private config: ProxyConfig;
    private serverConfig: ServerConfig;
    private servers: Map<number, Server | HttpsServer> = new Map();
    private isClusterMode: boolean;
    private workerCount: number;
    private roundRobinCounters: Map<string, number> = new Map();
    private logger: Logger;
    private httpAgent: HttpAgent;
    private httpsAgent: HttpsAgent;
    private portTLSMap: Map<number, boolean> = new Map(); // Track which ports use TLS

    constructor(config: ProxyConfig, serverConfig?: ServerConfig) {
        this.config = config;
        this.serverConfig = serverConfig ?? {};
        this.isClusterMode = this.serverConfig.cluster ?? false;
        this.workerCount = this.serverConfig.workers ?? cpus().length;
        const prefix = this.isClusterMode ? `Worker ${process.pid}` : 'ProxyServer';
        this.logger = new Logger(prefix);

        // Initialize HTTP/HTTPS agents with keep-alive for connection pooling
        this.httpAgent = new HttpAgent({
            keepAlive: true,
            maxSockets: 100,
            maxFreeSockets: 10,
            timeout: 60000,
        });

        this.httpsAgent = new HttpsAgent({
            keepAlive: true,
            maxSockets: 100,
            maxFreeSockets: 10,
            timeout: 60000,
        });
    }

    /**
     * Start all proxy servers based on configuration
     */
    start(): void {
        const isPrimary = cluster.isPrimary ?? (cluster as unknown as { isMaster: boolean }).isMaster;
        if (this.isClusterMode && isPrimary) {
            this.startCluster();
        } else {
            this.startWorkers();
        }
    }

    /**
     * Start cluster mode - spawn worker processes
     */
    private startCluster(): void {
        this.logger.info(`Starting cluster mode with ${this.workerCount} workers`);

        // Spawn workers
        for (let i = 0; i < this.workerCount; i++) {
            const worker = cluster.fork();
            this.logger.info(`Worker ${worker.process.pid} started`);
        }

        // Handle worker exit
        cluster.on('exit', (worker, code, signal) => {
            this.logger.warn(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
            cluster.fork();
        });

        // Handle graceful shutdown
        process.on('SIGTERM', () => {
            this.logger.info('Master received SIGTERM, shutting down workers...');
            for (const id in cluster.workers) {
                const worker = cluster.workers[id];
                if (worker) {
                    worker.kill();
                }
            }
        });
    }

    /**
     * Start worker processes (single process or cluster worker)
     */
    private startWorkers(): void {
        const ports = this.config.getPorts();

        for (const port of ports) {
            const tlsConfig = this.config.getTLSConfig(port);
            let server: Server | HttpsServer;

            if (tlsConfig) {
                // Create HTTPS server with TLS configuration
                try {
                    const tlsOptions = {
                        cert: readFileSync(tlsConfig.cert, 'utf-8'),
                        key: readFileSync(tlsConfig.key, 'utf-8'),
                        ca: tlsConfig.ca ? readFileSync(tlsConfig.ca, 'utf-8') : undefined,
                    };

                    server = createHttpsServer(tlsOptions, (req, res) => {
                        this.handleRequest(port, req, res);
                    });

                    this.portTLSMap.set(port, true);
                    this.logger.info(`Configuring HTTPS on port ${port}`);
                } catch (error) {
                    this.logger.error(`Failed to load TLS certificates for port ${port}: ${error instanceof Error ? error.message : String(error)}`);
                    continue;
                }
            } else {
                // Create HTTP server
                server = createHttpServer((req, res) => {
                    this.handleRequest(port, req, res);
                });

                this.portTLSMap.set(port, false);
            }

            server.listen(port, () => {
                const protocol = tlsConfig ? 'HTTPS' : 'HTTP';
                this.logger.info(`${protocol} proxy server listening on port ${port}`);
            });

            server.on('error', (error: Error & { code?: string }) => {
                if (error.code === 'EADDRINUSE') {
                    this.logger.error(`Port ${port} is already in use`);
                } else {
                    this.logger.error(`Error on port ${port}:`, error.message);
                }
            });

            this.servers.set(port, server);
        }
    }

    /**
     * Stop all proxy servers
     */
    stop(): void {
        const isPrimary = cluster.isPrimary ?? (cluster as unknown as { isMaster: boolean }).isMaster;
        if (this.isClusterMode && isPrimary) {
            // In cluster mode, kill all workers
            for (const id in cluster.workers) {
                const worker = cluster.workers[id];
                if (worker) {
                    worker.kill();
                }
            }
        } else {
            // In single process or worker mode, close servers
            for (const [port, server] of this.servers.entries()) {
                server.close(() => {
                    this.logger.info(`Proxy server on port ${port} stopped`);
                });
            }
            this.servers.clear();
        }
    }

    /**
     * Handle incoming request
     */
    private handleRequest(port: number, req: IncomingMessage, res: ServerResponse): void {
        const startTime = Date.now();
        const path = req.url ?? '/';
        const method = req.method ?? 'UNKNOWN';
        const clientIp = req.socket.remoteAddress ?? 'unknown';

        // Extract hostname from Host header
        const hostHeader = req.headers.host ?? '*';
        // Remove port from hostname (e.g., "myshop.local:80" -> "myshop.local")
        const hostname = hostHeader.split(':')[0];

        // Log incoming request with hostname
        this.logger.debug(`${method} ${path} -> ${hostname}:${port} (from ${clientIp})`);

        // Get rule using hostname-based routing
        const rule = this.config.getRule(port, hostname, path);

        if (!rule) {
            const duration = Date.now() - startTime;
            this.logger.warn(`${method} ${path} -> ${hostname}:${port} - No rule found (404) [${duration}ms]`);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }

        // Log rule type
        this.logger.debug(`${method} ${path} -> ${hostname}:${port} - Rule type: ${rule.type}`);

        switch (rule.type) {
            case RuleType.PROXY:
                this.handleProxy(rule, req, res, port, hostname, path, method, startTime);
                break;
            case RuleType.REDIRECT:
                this.handleRedirect(rule, req, res, port, hostname, path, method, startTime);
                break;
            case RuleType.REWRITE:
                this.handleRewrite(rule, req, res, port, hostname, path, method, startTime);
                break;
            default: {
                const duration = Date.now() - startTime;
                this.logger.error(`${method} ${path} -> ${hostname}:${port} - Unknown rule type [${duration}ms]`);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error: Unknown rule type');
            }
        }
    }

    /**
     * Get next target using round-robin load balancing
     * @param rule - Proxy rule with targets
     * @param port - Port number
     * @param hostname - Hostname from Host header
     * @param path - Request path
     * @returns Selected target URL
     */
    private getNextTarget(rule: StandardizedProxyRule, port: number, hostname: string, path: string): string {
        if (rule.targets.length === 0) {
            throw new Error('No targets available for proxy rule');
        }

        // If only one target, return it directly
        if (rule.targets.length === 1) {
            return rule.targets[0];
        }

        // Create a unique key for this rule (port + hostname + path)
        const key = `${port}:${hostname}:${path}`;

        // Get current index or initialize to 0
        const currentIndex = this.roundRobinCounters.get(key) ?? 0;

        // Select target using round-robin
        const target = rule.targets[currentIndex];

        // Update counter for next request (wrap around)
        const nextIndex = (currentIndex + 1) % rule.targets.length;
        this.roundRobinCounters.set(key, nextIndex);

        return target;
    }

    /**
     * Handle proxy rule - forward request to target
     */
    private handleProxy(rule: StandardizedProxyRule, req: IncomingMessage, res: ServerResponse, port: number, hostname: string, path: string, method: string, startTime: number): void {
        // Use round-robin to select target
        const target = this.getNextTarget(rule, port, hostname, path);
        const targetUrl = new URL(target);

        this.logger.info(`${method} ${path} -> ${hostname}:${port} - Proxying to ${target} (${rule.targets.indexOf(target) + 1}/${rule.targets.length})`);

        const headers = { ...req.headers } as Record<string, string | string[] | undefined>;

        // Get defaults configuration for headers
        const defaults = this.config.getDefaults();

        // Add X-Forwarded-* headers if enabled in defaults
        if (defaults?.headers?.x_forwarded) {
            const clientIp = req.socket.remoteAddress ?? '';
            const existingForwardedFor = headers['x-forwarded-for'];
            const isTLS = this.portTLSMap.get(port) ?? false;

            headers['x-forwarded-for'] = existingForwardedFor
                ? `${existingForwardedFor}, ${clientIp}`
                : clientIp;
            headers['x-forwarded-host'] = req.headers.host ?? '';
            headers['x-forwarded-proto'] = isTLS ? 'https' : 'http';
        }

        // Handle Host header based on pass_host setting
        if (defaults?.headers?.pass_host && req.headers.host) {
            headers['host'] = req.headers.host;
        } else {
            // Remove host header to avoid issues (default behavior)
            delete headers.host;
        }

        const options: RequestOptions = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
            path: req.url,
            method: req.method,
            headers,
            agent: targetUrl.protocol === 'https:' ? this.httpsAgent : this.httpAgent,
        };

        const proxyReq = (targetUrl.protocol === 'https:' ? httpsRequest : httpRequest)(options, (proxyRes) => {
            const duration = Date.now() - startTime;
            const statusCode = proxyRes.statusCode ?? 200;
            this.logger.info(`${method} ${path} -> ${hostname}:${port} - Response ${statusCode} from ${target} [${duration}ms]`);
            res.writeHead(statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (error) => {
            const duration = Date.now() - startTime;
            this.logger.error(`${method} ${path} -> ${hostname}:${port} - Proxy error to ${target}: ${error.message} [${duration}ms]`);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end('Bad Gateway');
            }
        });

        req.pipe(proxyReq);
    }

    /**
     * Handle redirect rule
     */
    private handleRedirect(rule: StandardizedRedirectRule, req: IncomingMessage, res: ServerResponse, port: number, hostname: string, path: string, method: string, startTime: number): void {
        let redirectUrl = rule.to;

        // Handle strip_prefix if specified
        if (rule.strip_prefix && req.url?.startsWith(rule.strip_prefix)) {
            const remainingPath = req.url.substring(rule.strip_prefix.length);
            redirectUrl = redirectUrl + remainingPath;
        }

        const duration = Date.now() - startTime;
        this.logger.info(`${method} ${path} -> ${hostname}:${port} - Redirect ${rule.status} to ${redirectUrl} [${duration}ms]`);

        res.writeHead(rule.status, {
            Location: redirectUrl,
        });
        res.end();
    }

    /**
     * Handle rewrite rule - rewrite path and proxy
     */
    private handleRewrite(rule: StandardizedRewriteRule, req: IncomingMessage, res: ServerResponse, port: number, hostname: string, path: string, method: string, startTime: number): void {
        // Rewrite the URL path
        const originalUrl = req.url ?? '/';
        const rewrittenUrl = rule.to + originalUrl;

        this.logger.debug(`${method} ${path} -> ${hostname}:${port} - Rewriting to ${rewrittenUrl}`);

        // Get the rule again with rewritten path (should be a proxy rule)
        const rewrittenRule = this.config.getRule(port, hostname, rewrittenUrl);
        if (rewrittenRule && rewrittenRule.type === RuleType.PROXY) {
            // Proxy to the rewritten path
            this.handleProxy(rewrittenRule, req, res, port, hostname, rewrittenUrl, method, startTime);
        } else {
            // If no rule found, try to proxy with the rewritten path directly
            // For now, we'll need to find a proxy rule for this port
            const portMap = this.config.getMap().get(port);
            if (portMap) {
                // Try to find hostname mapping
                const hostMap = portMap.get(hostname) ?? portMap.get('*');
                if (hostMap) {
                    // Try to find any proxy rule for this host
                    for (const [, rule] of hostMap.entries()) {
                        if (rule.type === RuleType.PROXY) {
                            const proxyRule = rule;
                            // Use the rewritten path
                            const target = proxyRule.targets[0];
                            const targetUrl = new URL(target);
                            const headers = { ...req.headers } as Record<string, string | string[] | undefined>;

                            // Get defaults configuration for headers
                            const defaults = this.config.getDefaults();

                            // Add X-Forwarded-* headers if enabled in defaults
                            if (defaults?.headers?.x_forwarded) {
                                const clientIp = req.socket.remoteAddress ?? '';
                                const existingForwardedFor = headers['x-forwarded-for'];
                                const isTLS = this.portTLSMap.get(port) ?? false;

                                headers['x-forwarded-for'] = existingForwardedFor
                                    ? `${existingForwardedFor}, ${clientIp}`
                                    : clientIp;
                                headers['x-forwarded-host'] = req.headers.host ?? '';
                                headers['x-forwarded-proto'] = isTLS ? 'https' : 'http';
                            }

                            // Handle Host header based on pass_host setting
                            if (defaults?.headers?.pass_host && req.headers.host) {
                                headers['host'] = req.headers.host;
                            } else {
                                // Remove host header to avoid issues (default behavior)
                                delete headers.host;
                            }

                            const options: RequestOptions = {
                                hostname: targetUrl.hostname,
                                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                                path: rewrittenUrl,
                                method: req.method,
                                headers,
                                agent: targetUrl.protocol === 'https:' ? this.httpsAgent : this.httpAgent,
                            };

                            const proxyReq = (targetUrl.protocol === 'https:' ? httpsRequest : httpRequest)(options, (proxyRes) => {
                                const duration = Date.now() - startTime;
                                const statusCode = proxyRes.statusCode ?? 200;
                                this.logger.info(`${method} ${rewrittenUrl} -> ${hostname}:${port} - Response ${statusCode} from ${target} [${duration}ms]`);
                                res.writeHead(statusCode, proxyRes.headers);
                                proxyRes.pipe(res);
                            });

                            proxyReq.on('error', (error) => {
                                const duration = Date.now() - startTime;
                                this.logger.error(`${method} ${rewrittenUrl} -> ${hostname}:${port} - Proxy error to ${target}: ${error.message} [${duration}ms]`);
                                if (!res.headersSent) {
                                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                                    res.end('Bad Gateway');
                                }
                            });

                            req.pipe(proxyReq);
                            return;
                        }
                    }
                }
            }

            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    }

}

