import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProxyServer } from '@/lib/proxy-server';
import { ProxyConfig } from '@/lib/proxy-config';
import { MockBackendServer } from '../utils/mock-backend-server';
import { makeRequest } from '../utils/test-helpers';
import { waitForServer } from '../utils/wait-for-server';

/**
 * Integration tests for ProxyServer
 * These tests use real HTTP servers to validate end-to-end functionality
 */
describe('ProxyServer - Basic Proxying', () => {
  let mockBackend: MockBackendServer;
  let proxyServer: ProxyServer;
  let backendPort: number;
  const proxyPort = 8765;

  beforeEach(async () => {
    // Start mock backend on dynamic port
    mockBackend = new MockBackendServer({
      responseCode: 200,
      responseBody: 'Hello from backend',
    });
    backendPort = await mockBackend.start();

    // Create proxy configuration
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": "http://localhost:${backendPort}"
    }`);

    // Start proxy server
    proxyServer = new ProxyServer(config);
    proxyServer.start();

    // Wait for proxy to be ready
    await waitForServer(proxyPort);

    // Clear request log after setup (waitForServer makes a health check request)
    mockBackend.clearRequestLog();
  });

  afterEach(async () => {
    // Clean up
    if (proxyServer) {
      proxyServer.stop();
    }
    if (mockBackend) {
      await mockBackend.stop();
    }
  });

  it('should proxy GET request to backend', async () => {
    // Make request to proxy
    const response = await makeRequest(proxyPort, '/api/users', {
      method: 'GET',
    });

    // Verify response
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Hello from backend');

    // Verify backend received the request
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('/api/users');
  });

  it('should proxy POST request with body', async () => {
    const requestBody = JSON.stringify({ name: 'Test User' });

    const response = await makeRequest(proxyPort, '/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(requestBody.length),
      },
      body: requestBody,
    });

    expect(response.statusCode).toBe(200);

    // Verify backend received the body
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].body).toBe(requestBody);
  });

  it('should forward request headers correctly', async () => {
    const response = await makeRequest(proxyPort, '/test', {
      method: 'GET',
      headers: {
        'User-Agent': 'test-client',
        'X-Custom-Header': 'custom-value',
      },
    });

    expect(response.statusCode).toBe(200);

    // Verify backend received custom headers
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);
    expect(requests[0].headers['user-agent']).toBe('test-client');
    expect(requests[0].headers['x-custom-header']).toBe('custom-value');
  });

  it('should remove Host header when forwarding', async () => {
    await makeRequest(proxyPort, '/test', {
      method: 'GET',
      headers: {
        'Host': 'example.com',
        'User-Agent': 'test-client',
      },
    });

    // Verify Host header was removed
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);

    // Host header should not be the original one
    // (proxy-server removes it and Node.js http module adds the correct one)
    expect(requests[0].headers.host).not.toBe('example.com');

    // Other headers should be preserved
    expect(requests[0].headers['user-agent']).toBe('test-client');
  });

  it('should handle multiple simultaneous requests', async () => {
    // Make 5 parallel requests
    const requests = Array.from({ length: 5 }, (_, i) =>
      makeRequest(proxyPort, `/test${i}`, { method: 'GET' })
    );

    const responses = await Promise.all(requests);

    // All requests should succeed
    responses.forEach(response => {
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('Hello from backend');
    });

    // Backend should have received all 5 requests
    const backendRequests = mockBackend.getRequestLog();
    expect(backendRequests).toHaveLength(5);
  });
});

describe('ProxyServer - Path-based Routing', () => {
  let mockBackend1: MockBackendServer;
  let mockBackend2: MockBackendServer;
  let proxyServer: ProxyServer;
  let backend1Port: number;
  let backend2Port: number;
  const proxyPort = 8766;

  beforeEach(async () => {
    // Start two mock backends
    mockBackend1 = new MockBackendServer({ responseBody: 'Backend 1' });
    mockBackend2 = new MockBackendServer({ responseBody: 'Backend 2' });

    backend1Port = await mockBackend1.start();
    backend2Port = await mockBackend2.start();

    // Create proxy with path-based routing
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/api": "http://localhost:${backend1Port}",
        "/web": "http://localhost:${backend2Port}"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    mockBackend1.clearRequestLog();
    mockBackend2.clearRequestLog();
  });

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend1) await mockBackend1.stop();
    if (mockBackend2) await mockBackend2.stop();
  });

  it('should route /api requests to backend 1', async () => {
    const response = await makeRequest(proxyPort, '/api');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Backend 1');
    expect(mockBackend1.getRequestLog()).toHaveLength(1);
    expect(mockBackend2.getRequestLog()).toHaveLength(0);
  });

  it('should route /web requests to backend 2', async () => {
    const response = await makeRequest(proxyPort, '/web');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Backend 2');
    expect(mockBackend1.getRequestLog()).toHaveLength(0);
    expect(mockBackend2.getRequestLog()).toHaveLength(1);
  });

  it('should return 404 for unmapped paths', async () => {
    const response = await makeRequest(proxyPort, '/unknown');

    expect(response.statusCode).toBe(404);
    expect(mockBackend1.getRequestLog()).toHaveLength(0);
    expect(mockBackend2.getRequestLog()).toHaveLength(0);
  });
});

describe('ProxyServer - Wildcard Path Routing', () => {
  let mockBackend1: MockBackendServer;
  let mockBackend2: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8767;

  beforeEach(async () => {
    mockBackend1 = new MockBackendServer({ responseBody: 'API Backend' });
    mockBackend2 = new MockBackendServer({ responseBody: 'Fallback Backend' });

    const backend1Port = await mockBackend1.start();
    const backend2Port = await mockBackend2.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/api": "http://localhost:${backend1Port}",
        "*": "http://localhost:${backend2Port}"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    mockBackend1.clearRequestLog();
    mockBackend2.clearRequestLog();
  });

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend1) await mockBackend1.stop();
    if (mockBackend2) await mockBackend2.stop();
  });

  it('should route exact path match to specific backend', async () => {
    const response = await makeRequest(proxyPort, '/api');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('API Backend');
  });

  it('should fallback to wildcard for non-matching paths', async () => {
    const response = await makeRequest(proxyPort, '/other/path');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Fallback Backend');
  });
});

describe('ProxyServer - Virtual Host Routing', () => {
  let mockBackend1: MockBackendServer;
  let mockBackend2: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8768;

  beforeEach(async () => {
    mockBackend1 = new MockBackendServer({ responseBody: 'Shop Backend' });
    mockBackend2 = new MockBackendServer({ responseBody: 'Blog Backend' });

    const backend1Port = await mockBackend1.start();
    const backend2Port = await mockBackend2.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "hosts": {
          "shop.example.com": "http://localhost:${backend1Port}",
          "blog.example.com": "http://localhost:${backend2Port}"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    mockBackend1.clearRequestLog();
    mockBackend2.clearRequestLog();
  });

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend1) await mockBackend1.stop();
    if (mockBackend2) await mockBackend2.stop();
  });

  it('should route by hostname to correct backend', async () => {
    const response = await makeRequest(proxyPort, '/', {
      headers: { Host: 'shop.example.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Shop Backend');
  });

  it('should route different hostname to different backend', async () => {
    const response = await makeRequest(proxyPort, '/', {
      headers: { Host: 'blog.example.com' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Blog Backend');
  });

  it('should return 404 for unknown hostname', async () => {
    const response = await makeRequest(proxyPort, '/', {
      headers: { Host: 'unknown.example.com' }
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('ProxyServer - Virtual Host with Wildcard', () => {
  let mockBackend1: MockBackendServer;
  let mockBackend2: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8769;

  beforeEach(async () => {
    mockBackend1 = new MockBackendServer({ responseBody: 'API Backend' });
    mockBackend2 = new MockBackendServer({ responseBody: 'Default Backend' });

    const backend1Port = await mockBackend1.start();
    const backend2Port = await mockBackend2.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "hosts": {
          "api.example.com": "http://localhost:${backend1Port}",
          "*": "http://localhost:${backend2Port}"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    mockBackend1.clearRequestLog();
    mockBackend2.clearRequestLog();
  });

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend1) await mockBackend1.stop();
    if (mockBackend2) await mockBackend2.stop();
  });

  it('should route known hostname to specific backend', async () => {
    const response = await makeRequest(proxyPort, '/', {
      headers: { Host: 'api.example.com' }
    });

    expect(response.body).toBe('API Backend');
  });

  it('should fallback to wildcard for unknown hostname', async () => {
    const response = await makeRequest(proxyPort, '/', {
      headers: { Host: 'other.example.com' }
    });

    expect(response.body).toBe('Default Backend');
  });
});

describe('ProxyServer - Foundation Validation', () => {
  it('should validate MockBackendServer works', async () => {
    const backend = new MockBackendServer({
      responseBody: 'Test response',
      responseCode: 200,
    });

    const port = await backend.start();
    expect(port).toBeGreaterThan(0);
    expect(backend.isRunning()).toBe(true);

    // Make direct request to backend
    const response = await makeRequest(port, '/test');
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Test response');

    // Check request was logged
    const log = backend.getRequestLog();
    expect(log).toHaveLength(1);
    expect(log[0].url).toBe('/test');

    await backend.stop();
    expect(backend.isRunning()).toBe(false);
  });

  it('should validate waitForServer works', async () => {
    const backend = new MockBackendServer();
    const port = await backend.start();

    // Should not throw - server is running
    await expect(waitForServer(port, 1000)).resolves.toBeUndefined();

    await backend.stop();
  });

  it('should timeout when server is not available', async () => {
    const nonExistentPort = 59999;

    // Should timeout
    await expect(
      waitForServer(nonExistentPort, 500)
    ).rejects.toThrow(/did not start within/);
  });
});
