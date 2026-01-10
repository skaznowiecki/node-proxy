import http from 'http';

/**
 * Wait for a server to be ready and accepting connections
 *
 * This function polls the server by attempting to make HTTP requests
 * until one succeeds or the timeout is reached.
 *
 * @param port - Port number to check
 * @param timeout - Maximum time to wait in milliseconds (default: 5000)
 * @param hostname - Hostname to connect to (default: 'localhost')
 * @returns Promise that resolves when server is ready or rejects on timeout
 *
 * @example
 * ```typescript
 * const server = new ProxyServer(config);
 * server.start();
 * await waitForServer(8080);
 * // Server is now ready to accept connections
 * ```
 */
export async function waitForServer(
  port: number,
  timeout: number = 5000,
  hostname: string = 'localhost'
): Promise<void> {
  const start = Date.now();
  const pollInterval = 100; // Check every 100ms

  while (Date.now() - start < timeout) {
    try {
      await checkServerConnection(port, hostname);
      return; // Server is ready
    } catch {
      // Server not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(
    `Server on ${hostname}:${port} did not start within ${timeout}ms`
  );
}

/**
 * Check if server is accepting connections by making a request
 *
 * @param port - Port number to check
 * @param hostname - Hostname to connect to
 * @returns Promise that resolves if connection succeeds, rejects otherwise
 */
function checkServerConnection(port: number, hostname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port,
        path: '/',
        method: 'GET',
        timeout: 500,
      },
      (res) => {
        // Connection succeeded (any response means server is listening)
        res.resume(); // Consume response data
        resolve();
      }
    );

    req.on('error', (error) => {
      // Connection failed
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection timeout'));
    });

    req.end();
  });
}

/**
 * Wait for multiple servers to be ready
 *
 * @param ports - Array of port numbers to check
 * @param timeout - Maximum time to wait in milliseconds for each server
 * @param hostname - Hostname to connect to
 * @returns Promise that resolves when all servers are ready
 */
export async function waitForServers(
  ports: number[],
  timeout: number = 5000,
  hostname: string = 'localhost'
): Promise<void> {
  await Promise.all(
    ports.map(port => waitForServer(port, timeout, hostname))
  );
}
