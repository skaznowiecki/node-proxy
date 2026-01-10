import http from 'http';
import { ProxyConfig } from '@/lib/proxy-config';

/**
 * Options for making HTTP requests
 */
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

/**
 * HTTP response from makeRequest
 */
export interface RequestResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/**
 * Make an HTTP request to a server and return the response
 *
 * @param port - Port to connect to
 * @param path - Request path
 * @param options - Request options (method, headers, body, timeout)
 * @returns Promise resolving to the response
 */
export async function makeRequest(
  port: number,
  path: string,
  options: RequestOptions = {}
): Promise<RequestResponse> {
  return new Promise((resolve, reject) => {
    const requestOptions: http.RequestOptions = {
      hostname: 'localhost',
      port,
      path,
      method: options.method ?? 'GET',
      headers: options.headers ?? {},
      timeout: options.timeout ?? 5000,
    };

    const req = http.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: { ...res.headers },
          body,
        });
      });

      res.on('error', (error) => {
        reject(error);
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${options.timeout}ms`));
    });

    // Write body if provided
    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Make an HTTP request with a custom Host header
 * Useful for testing virtual host routing
 *
 * @param port - Port to connect to
 * @param hostname - Hostname to set in Host header
 * @param path - Request path
 * @param options - Request options
 * @returns Promise resolving to the response
 */
export async function makeRequestWithHost(
  port: number,
  hostname: string,
  path: string,
  options: RequestOptions = {}
): Promise<RequestResponse> {
  const headers = {
    ...options.headers,
    Host: hostname,
  };

  return makeRequest(port, path, { ...options, headers });
}

/**
 * Create a ProxyConfig from JSON string
 * Helper to reduce boilerplate in tests
 *
 * @param configJson - JSON configuration string
 * @returns ProxyConfig instance
 */
export function createTestConfig(configJson: string): ProxyConfig {
  return ProxyConfig.loadFromString(configJson);
}

/**
 * Wait for a condition to become true
 * Useful for polling until something is ready
 *
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds
 * @param interval - Polling interval in milliseconds
 * @returns Promise that resolves when condition is met or rejects on timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const result = await Promise.resolve(condition());
    if (result) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Sleep for a specified duration
 * Useful for adding delays in tests
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find an available port (for dynamic port allocation in tests)
 * Not actually needed since we use port 0 for auto-assignment,
 * but included for completeness
 *
 * @returns Promise resolving to an available port number
 */
export async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, 'localhost', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => {
          resolve(port);
        });
      } else {
        server.close(() => {
          reject(new Error('Failed to get server address'));
        });
      }
    });
    server.on('error', reject);
  });
}

/**
 * Make multiple parallel requests
 * Useful for testing load balancing and concurrent request handling
 *
 * @param port - Port to connect to
 * @param path - Request path
 * @param count - Number of requests to make
 * @param options - Request options
 * @returns Promise resolving to array of responses
 */
export async function makeParallelRequests(
  port: number,
  path: string,
  count: number,
  options: RequestOptions = {}
): Promise<RequestResponse[]> {
  const requests = Array.from({ length: count }, () =>
    makeRequest(port, path, options)
  );
  return Promise.all(requests);
}

/**
 * Make sequential requests with a delay between them
 * Useful for testing round-robin behavior
 *
 * @param port - Port to connect to
 * @param path - Request path
 * @param count - Number of requests to make
 * @param delayMs - Delay between requests in milliseconds
 * @param options - Request options
 * @returns Promise resolving to array of responses
 */
export async function makeSequentialRequests(
  port: number,
  path: string,
  count: number,
  delayMs: number = 0,
  options: RequestOptions = {}
): Promise<RequestResponse[]> {
  const responses: RequestResponse[] = [];

  for (let i = 0; i < count; i++) {
    if (i > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    const response = await makeRequest(port, path, options);
    responses.push(response);
  }

  return responses;
}
