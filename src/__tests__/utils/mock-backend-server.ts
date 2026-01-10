import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';

/**
 * Request log entry for tracking requests received by the mock server
 */
export interface RequestLog {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  timestamp: number;
}

/**
 * Configuration options for MockBackendServer
 */
export interface MockServerOptions {
  /** Port to listen on (0 = auto-assign free port) */
  port?: number;
  /** Hostname to bind to */
  hostname?: string;
  /** Delay in milliseconds before responding */
  delay?: number;
  /** Failure rate (0-1) for simulating unreliable backends */
  failureRate?: number;
  /** HTTP response status code */
  responseCode?: number;
  /** Response headers */
  responseHeaders?: Record<string, string>;
  /** Response body (string or function that generates body from request) */
  responseBody?: string | ((req: IncomingMessage) => string);
  /** Whether to simulate connection errors */
  simulateError?: boolean;
}

/**
 * Mock HTTP backend server for integration testing
 *
 * Creates a real HTTP server that can be used to test proxy functionality.
 * Supports configurable responses, request logging, error simulation, and delays.
 *
 * @example
 * ```typescript
 * const backend = new MockBackendServer({
 *   responseBody: 'Hello from backend',
 *   responseCode: 200
 * });
 * const port = await backend.start();
 * // ... make requests to the backend through proxy
 * const requests = backend.getRequestLog();
 * await backend.stop();
 * ```
 */
export class MockBackendServer {
  private server: Server | null = null;
  private port: number;
  private hostname: string;
  private requestLog: RequestLog[] = [];
  private options: MockServerOptions;

  constructor(options: MockServerOptions = {}) {
    this.port = options.port ?? 0; // 0 = auto-assign free port
    this.hostname = options.hostname ?? 'localhost';
    this.options = {
      responseCode: 200,
      responseBody: 'OK',
      ...options,
    };
  }

  /**
   * Start the mock backend server
   * @returns Promise that resolves with the actual port number
   */
  async start(): Promise<number> {
    if (this.server) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        reject(error);
      });

      this.server.listen(this.port, this.hostname, () => {
        const address = this.server!.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
    });
  }

  /**
   * Stop the mock backend server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          reject(error);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Collect request body
    const body = await this.collectBody(req);

    // Log the request
    this.requestLog.push({
      method: req.method ?? 'UNKNOWN',
      url: req.url ?? '/',
      headers: { ...req.headers },
      body,
      timestamp: Date.now(),
    });

    // Simulate error if configured
    if (this.options.simulateError) {
      req.socket.destroy();
      return;
    }

    // Simulate failure rate
    if (this.options.failureRate && Math.random() < this.options.failureRate) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Simulated Failure');
      return;
    }

    // Apply delay if configured
    if (this.options.delay) {
      await new Promise(resolve => setTimeout(resolve, this.options.delay));
    }

    // Generate response body
    let responseBody: string;
    if (typeof this.options.responseBody === 'function') {
      responseBody = this.options.responseBody(req);
    } else {
      responseBody = this.options.responseBody ?? 'OK';
    }

    // Send response
    const headers = {
      'Content-Type': 'text/plain',
      ...this.options.responseHeaders,
    };

    res.writeHead(this.options.responseCode ?? 200, headers);
    res.end(responseBody);
  }

  /**
   * Collect request body as a string
   */
  private collectBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => {
        chunks.push(chunk);
      });
      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      req.on('error', () => {
        resolve('');
      });
    });
  }

  /**
   * Get all logged requests
   */
  getRequestLog(): RequestLog[] {
    return [...this.requestLog];
  }

  /**
   * Get the most recent request
   */
  getLastRequest(): RequestLog | undefined {
    return this.requestLog[this.requestLog.length - 1];
  }

  /**
   * Clear the request log
   */
  clearRequestLog(): void {
    this.requestLog = [];
  }

  /**
   * Get the port the server is listening on
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Set response code dynamically
   */
  setResponseCode(code: number): void {
    this.options.responseCode = code;
  }

  /**
   * Set response body dynamically
   */
  setResponseBody(body: string | ((req: IncomingMessage) => string)): void {
    this.options.responseBody = body;
  }

  /**
   * Enable error simulation
   */
  enableErrorSimulation(): void {
    this.options.simulateError = true;
  }

  /**
   * Disable error simulation
   */
  disableErrorSimulation(): void {
    this.options.simulateError = false;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server?.listening ?? false;
  }
}
