import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProxyServer } from '@/lib/proxy-server';
import { ProxyConfig } from '@/lib/proxy-config';
import { MockBackendServer } from '../utils/mock-backend-server';
import { makeRequest, makeSequentialRequests } from '../utils/test-helpers';
import { waitForServer } from '../utils/wait-for-server';

/**
 * Integration tests for load balancing / round-robin functionality
 */
describe('ProxyServer - Round-Robin Load Balancing', () => {
  let mockBackend1: MockBackendServer;
  let mockBackend2: MockBackendServer;
  let mockBackend3: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8770;

  beforeEach(async () => {
    // Start three mock backends with unique responses
    mockBackend1 = new MockBackendServer({ responseBody: 'Backend 1' });
    mockBackend2 = new MockBackendServer({ responseBody: 'Backend 2' });
    mockBackend3 = new MockBackendServer({ responseBody: 'Backend 3' });

    const port1 = await mockBackend1.start();
    const port2 = await mockBackend2.start();
    const port3 = await mockBackend3.start();

    // Create proxy with load balancing using wildcard
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

    // Clear logs after setup
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

  it('should distribute requests evenly across all backends', async () => {
    // Make 9 sequential requests
    const responses = await makeSequentialRequests(proxyPort, '/test', 9);

    // All requests should succeed
    responses.forEach(r => expect(r.statusCode).toBe(200));

    // Each backend should receive exactly 3 requests
    expect(mockBackend1.getRequestLog()).toHaveLength(3);
    expect(mockBackend2.getRequestLog()).toHaveLength(3);
    expect(mockBackend3.getRequestLog()).toHaveLength(3);
  });

  it('should cycle through backends in round-robin order', async () => {
    // Make 6 sequential requests
    const responses = await makeSequentialRequests(proxyPort, '/test', 6);

    // Verify round-robin pattern: B1, B2, B3, B1, B2, B3
    expect(responses[0].body).toBe('Backend 1');
    expect(responses[1].body).toBe('Backend 2');
    expect(responses[2].body).toBe('Backend 3');
    expect(responses[3].body).toBe('Backend 1');
    expect(responses[4].body).toBe('Backend 2');
    expect(responses[5].body).toBe('Backend 3');
  });

  it('should wrap around after reaching last backend', async () => {
    // Make 4 requests to verify wrap-around
    const responses = await makeSequentialRequests(proxyPort, '/test', 4);

    expect(responses[0].body).toBe('Backend 1');
    expect(responses[1].body).toBe('Backend 2');
    expect(responses[2].body).toBe('Backend 3');
    expect(responses[3].body).toBe('Backend 1'); // Wrapped around
  });

  it('should maintain counter state across requests', async () => {
    // Make first request
    const r1 = await makeRequest(proxyPort, '/test');
    expect(r1.body).toBe('Backend 1');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Second request should go to Backend 2, not back to Backend 1
    const r2 = await makeRequest(proxyPort, '/test');
    expect(r2.body).toBe('Backend 2');

    // Third request should go to Backend 3
    const r3 = await makeRequest(proxyPort, '/test');
    expect(r3.body).toBe('Backend 3');
  });
});

describe('ProxyServer - Independent Round-Robin Counters', () => {
  let mockBackend1: MockBackendServer;
  let mockBackend2: MockBackendServer;
  let mockBackend3: MockBackendServer;
  let mockBackend4: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8771;

  beforeEach(async () => {
    mockBackend1 = new MockBackendServer({ responseBody: 'API-1' });
    mockBackend2 = new MockBackendServer({ responseBody: 'API-2' });
    mockBackend3 = new MockBackendServer({ responseBody: 'WEB-1' });
    mockBackend4 = new MockBackendServer({ responseBody: 'WEB-2' });

    const port1 = await mockBackend1.start();
    const port2 = await mockBackend2.start();
    const port3 = await mockBackend3.start();
    const port4 = await mockBackend4.start();

    // Two different paths with different backends
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/api": {
          "type": "proxy",
          "to": ["http://localhost:${port1}", "http://localhost:${port2}"]
        },
        "/web": {
          "type": "proxy",
          "to": ["http://localhost:${port3}", "http://localhost:${port4}"]
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    mockBackend1.clearRequestLog();
    mockBackend2.clearRequestLog();
    mockBackend3.clearRequestLog();
    mockBackend4.clearRequestLog();
  });

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend1) await mockBackend1.stop();
    if (mockBackend2) await mockBackend2.stop();
    if (mockBackend3) await mockBackend3.stop();
    if (mockBackend4) await mockBackend4.stop();
  });

  it('should maintain independent counters per path', async () => {
    // Make requests to /api
    await makeRequest(proxyPort, '/api');
    await makeRequest(proxyPort, '/api');

    // Make requests to /web
    await makeRequest(proxyPort, '/web');
    await makeRequest(proxyPort, '/web');

    // API backends should each get 1 request
    expect(mockBackend1.getRequestLog()).toHaveLength(1);
    expect(mockBackend2.getRequestLog()).toHaveLength(1);

    // WEB backends should each get 1 request
    expect(mockBackend3.getRequestLog()).toHaveLength(1);
    expect(mockBackend4.getRequestLog()).toHaveLength(1);
  });

  it('should not interfere between different paths', async () => {
    // Alternating requests to different paths
    const r1 = await makeRequest(proxyPort, '/api');
    const r2 = await makeRequest(proxyPort, '/web');
    const r3 = await makeRequest(proxyPort, '/api');
    const r4 = await makeRequest(proxyPort, '/web');

    // API requests should round-robin independently
    expect(r1.body).toBe('API-1');
    expect(r3.body).toBe('API-2');

    // WEB requests should round-robin independently
    expect(r2.body).toBe('WEB-1');
    expect(r4.body).toBe('WEB-2');
  });
});

describe('ProxyServer - Single Target (No Round-Robin)', () => {
  let mockBackend: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8772;

  beforeEach(async () => {
    mockBackend = new MockBackendServer({ responseBody: 'Single Backend' });
    const backendPort = await mockBackend.start();

    // Single target configuration
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": "http://localhost:${backendPort}"
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    mockBackend.clearRequestLog();
  });

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend) await mockBackend.stop();
  });

  it('should send all requests to single backend', async () => {
    const responses = await makeSequentialRequests(proxyPort, '/test', 5);

    // All requests go to same backend
    responses.forEach(r => expect(r.body).toBe('Single Backend'));

    // Backend received all 5 requests
    expect(mockBackend.getRequestLog()).toHaveLength(5);
  });
});

describe('ProxyServer - Load Balancing with Backend Failures', () => {
  let mockBackend1: MockBackendServer;
  let mockBackend2: MockBackendServer;
  let mockBackend3: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8773;

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

  it('should still cycle through all backends even when one fails', async () => {
    const responses = await makeSequentialRequests(proxyPort, '/test', 3);

    // Round-robin still happens
    expect(responses[0].statusCode).toBe(200); // Backend 1
    expect(responses[1].statusCode).toBe(500); // Backend 2 (fails)
    expect(responses[2].statusCode).toBe(200); // Backend 3

    // All backends received their requests
    expect(mockBackend1.getRequestLog()).toHaveLength(1);
    expect(mockBackend2.getRequestLog()).toHaveLength(1);
    expect(mockBackend3.getRequestLog()).toHaveLength(1);
  });

  it('should return 502 when backend is unavailable', async () => {
    // Stop backend 2
    await mockBackend2.stop();

    const responses = await makeSequentialRequests(proxyPort, '/test', 3);

    expect(responses[0].statusCode).toBe(200); // Backend 1
    expect(responses[1].statusCode).toBe(502); // Backend 2 (stopped)
    expect(responses[2].statusCode).toBe(200); // Backend 3
  });
});

describe('ProxyServer - Load Balancing with Virtual Hosts', () => {
  let mockBackend1: MockBackendServer;
  let mockBackend2: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8774;

  beforeEach(async () => {
    mockBackend1 = new MockBackendServer({ responseBody: 'API-1' });
    mockBackend2 = new MockBackendServer({ responseBody: 'API-2' });

    const port1 = await mockBackend1.start();
    const port2 = await mockBackend2.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "hosts": {
          "api.example.com": {
            "*": {
              "type": "proxy",
              "to": ["http://localhost:${port1}", "http://localhost:${port2}"]
            }
          }
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

  it('should load balance within virtual host', async () => {
    const r1 = await makeRequest(proxyPort, '/', {
      headers: { Host: 'api.example.com' }
    });
    const r2 = await makeRequest(proxyPort, '/', {
      headers: { Host: 'api.example.com' }
    });

    expect(r1.body).toBe('API-1');
    expect(r2.body).toBe('API-2');
  });
});
