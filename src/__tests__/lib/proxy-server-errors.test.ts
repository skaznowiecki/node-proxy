import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProxyServer } from '@/lib/proxy-server';
import { ProxyConfig } from '@/lib/proxy-config';
import { MockBackendServer } from '../utils/mock-backend-server';
import { makeRequest } from '../utils/test-helpers';
import { waitForServer } from '../utils/wait-for-server';

/**
 * Integration tests for error handling functionality
 */
describe('ProxyServer - Error Handling', () => {
  let proxyServer: ProxyServer;
  const proxyPort = 8790;

  afterEach(() => {
    if (proxyServer) proxyServer.stop();
  });

  it('should return 404 for unmapped path (no backend)', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/api": "http://localhost:3000"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    // Request to path with no configuration
    const response = await makeRequest(proxyPort, '/unmapped');

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('Not Found');
  });

  it('should return 404 for unmapped path (with backend)', async () => {
    const mockBackend = new MockBackendServer({ responseBody: 'OK' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/api": "http://localhost:${backendPort}"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    const response = await makeRequest(proxyPort, '/unmapped');

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('Not Found');

    await mockBackend.stop();
  });

  it('should return 404 for unmapped hostname', async () => {
    const mockBackend = new MockBackendServer({ responseBody: 'OK' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "hosts": {
          "api.example.com": "http://localhost:${backendPort}"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    // Request to unmapped hostname
    const response = await makeRequest(proxyPort, '/', {
      headers: { Host: 'unknown.example.com' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('Not Found');

    await mockBackend.stop();
  });

  it('should return 502 when backend is unavailable', async () => {
    // Configure proxy to point to a port that has no server
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": "http://localhost:59999"
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    const response = await makeRequest(proxyPort, '/test');

    expect(response.statusCode).toBe(502);
    expect(response.body).toContain('Bad Gateway');
  });

  it('should return 502 when backend connection fails', async () => {
    const mockBackend = new MockBackendServer({ responseBody: 'OK' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": "http://localhost:${backendPort}"
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    // Stop the backend before making the request
    await mockBackend.stop();

    const response = await makeRequest(proxyPort, '/test');

    expect(response.statusCode).toBe(502);
    expect(response.body).toContain('Bad Gateway');
  });

  it('should handle backend returning 500 error', async () => {
    const mockBackend = new MockBackendServer({
      responseBody: 'Internal Server Error',
      responseCode: 500,
    });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": "http://localhost:${backendPort}"
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    const response = await makeRequest(proxyPort, '/error');

    // Proxy should forward the 500 status code
    expect(response.statusCode).toBe(500);
    expect(response.body).toBe('Internal Server Error');

    await mockBackend.stop();
  });

  it('should handle backend returning 404', async () => {
    const mockBackend = new MockBackendServer({
      responseBody: 'Not Found',
      responseCode: 404,
    });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": "http://localhost:${backendPort}"
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    const response = await makeRequest(proxyPort, '/missing');

    expect(response.statusCode).toBe(404);
    expect(response.body).toBe('Not Found');

    await mockBackend.stop();
  });

  it('should handle malformed request URL gracefully', async () => {
    const mockBackend = new MockBackendServer({ responseBody: 'OK' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": "http://localhost:${backendPort}"
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    // Request with spaces in path (which is technically valid but unusual)
    const response = await makeRequest(proxyPort, '/test%20path');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('OK');

    await mockBackend.stop();
  });

  it('should handle concurrent errors independently', async () => {
    const mockBackend1 = new MockBackendServer({ responseBody: 'OK' });

    const port1 = await mockBackend1.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/api1": "http://localhost:${port1}",
        "/api2": "http://localhost:59998"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    // Make concurrent requests - one should succeed, one should fail
    const [r1, r2] = await Promise.all([
      makeRequest(proxyPort, '/api1'),
      makeRequest(proxyPort, '/api2'),
    ]);

    expect(r1.statusCode).toBe(200);
    expect(r1.body).toBe('OK');

    expect(r2.statusCode).toBe(502);
    expect(r2.body).toContain('Bad Gateway');

    await mockBackend1.stop();
  });
});

describe('ProxyServer - Backend Timeout Handling', () => {
  let mockBackend: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8791;

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend) await mockBackend.stop();
  });

  it('should handle slow backend responses', async () => {
    mockBackend = new MockBackendServer({
      responseBody: 'Slow Response',
      delay: 100, // 100ms delay
    });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": "http://localhost:${backendPort}"
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    const startTime = Date.now();
    const response = await makeRequest(proxyPort, '/slow');
    const duration = Date.now() - startTime;

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Slow Response');
    expect(duration).toBeGreaterThanOrEqual(100);
  });
});

describe('ProxyServer - Load Balancing Error Handling', () => {
  let mockBackend1: MockBackendServer;
  let mockBackend2: MockBackendServer;
  let mockBackend3: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8792;

  beforeEach(async () => {
    mockBackend1 = new MockBackendServer({ responseBody: 'Backend 1', responseCode: 200 });
    mockBackend2 = new MockBackendServer({ responseBody: 'Backend 2', responseCode: 500 });
    mockBackend3 = new MockBackendServer({ responseBody: 'Backend 3', responseCode: 200 });

    const port1 = await mockBackend1.start();
    const port2 = await mockBackend2.start();
    const port3 = await mockBackend3.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "*": {
          "type": "proxy",
          "to": [
            "http://localhost:${port1}",
            "http://localhost:${port2}",
            "http://localhost:${port3}"
          ]
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    mockBackend1.clearRequestLog();
    mockBackend2.clearRequestLog();
    mockBackend3.clearRequestLog();
  });

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend1) await mockBackend1.stop();
    if (mockBackend2) await mockBackend2.stop();
    if (mockBackend3) await mockBackend3.stop();
  });

  it('should continue round-robin even when one backend returns errors', async () => {
    // Make 6 sequential requests - backend 2 will return 500 errors
    const responses = [];
    for (let i = 0; i < 6; i++) {
      responses.push(await makeRequest(proxyPort, '/test'));
    }

    // Verify round-robin continues
    expect(responses[0].statusCode).toBe(200);
    expect(responses[0].body).toBe('Backend 1');

    expect(responses[1].statusCode).toBe(500);
    expect(responses[1].body).toBe('Backend 2');

    expect(responses[2].statusCode).toBe(200);
    expect(responses[2].body).toBe('Backend 3');

    expect(responses[3].statusCode).toBe(200);
    expect(responses[3].body).toBe('Backend 1');

    expect(responses[4].statusCode).toBe(500);
    expect(responses[4].body).toBe('Backend 2');

    expect(responses[5].statusCode).toBe(200);
    expect(responses[5].body).toBe('Backend 3');
  });
});
