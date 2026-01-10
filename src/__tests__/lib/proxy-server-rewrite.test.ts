import { describe, it, expect, afterEach } from 'vitest';
import { ProxyServer } from '@/lib/proxy-server';
import { ProxyConfig } from '@/lib/proxy-config';
import { MockBackendServer } from '../utils/mock-backend-server';
import { makeRequest } from '../utils/test-helpers';
import { waitForServer } from '../utils/wait-for-server';

/**
 * Integration tests for rewrite rule functionality
 */
describe('ProxyServer - Rewrite Rules', () => {
  let mockBackend: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8780;

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend) await mockBackend.stop();
  });

  it('should rewrite path to match different proxy rule', async () => {
    mockBackend = new MockBackendServer({ responseBody: 'New API Response' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/old": {
          "type": "rewrite",
          "to": "/new"
        },
        "/new/old": "http://localhost:${backendPort}"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    // Request: /old -> rewrites to /new/old for rule matching -> proxies to backend
    // Backend receives original path /old (not rewritten path)
    const response = await makeRequest(proxyPort, '/old');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('New API Response');

    // Backend receives original URL when rule match succeeds
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/old');
  });

  it('should route to different backend via rewrite', async () => {
    const mockBackend1 = new MockBackendServer({ responseBody: 'V1 Backend' });
    const mockBackend2 = new MockBackendServer({ responseBody: 'V2 Backend' });
    const port1 = await mockBackend1.start();
    const port2 = await mockBackend2.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/old-api": {
          "type": "rewrite",
          "to": "/new-api"
        },
        "/new-api/old-api": "http://localhost:${port2}",
        "*": "http://localhost:${port1}"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend1.clearRequestLog();
    mockBackend2.clearRequestLog();

    // Request to /old-api rewrites to /new-api/old-api, matches second backend
    const response = await makeRequest(proxyPort, '/old-api');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('V2 Backend');

    // Backend 2 receives the request with original URL
    expect(mockBackend2.getRequestLog()).toHaveLength(1);
    expect(mockBackend2.getRequestLog()[0].url).toBe('/old-api');
    expect(mockBackend1.getRequestLog()).toHaveLength(0);

    await mockBackend1.stop();
    await mockBackend2.stop();
  });

  it('should handle rewrite with wildcard matching for query parameters', async () => {
    mockBackend = new MockBackendServer({ responseBody: 'Query Response' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/search": {
          "type": "rewrite",
          "to": "/api"
        },
        "*": "http://localhost:${backendPort}"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    // Request with query params: /search?q=test
    // Rewrites to /api/search?q=test, matches wildcard proxy rule
    // When wildcard matches during rewrite, backend receives ORIGINAL URL
    const response = await makeRequest(proxyPort, '/search?q=test');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Query Response');

    // Backend receives original URL (not rewritten) when wildcard proxy matches
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/search?q=test');
  });

  it('should fallback to wildcard when rewritten path has no exact match', async () => {
    mockBackend = new MockBackendServer({ responseBody: 'Fallback Backend' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/api": {
          "type": "rewrite",
          "to": "/backend"
        },
        "*": "http://localhost:${backendPort}"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    // Request: /api -> rewrites to /backend/api
    // Wildcard proxy (*) matches the rewritten path
    // Backend receives original URL (not rewritten) when wildcard matches
    const response = await makeRequest(proxyPort, '/api');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Fallback Backend');

    // Backend receives the original path (not rewritten)
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api');
  });

  it('should return 404 when no proxy rule exists for rewritten path', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/api": {
          "type": "rewrite",
          "to": "/backend"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    // Request: /api -> rewrites to /backend/api
    // No proxy rule exists, should return 404
    const response = await makeRequest(proxyPort, '/api');

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('Not Found');
  });

  it('should handle POST request with body through rewrite', async () => {
    mockBackend = new MockBackendServer({ responseBody: 'Created' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/create": {
          "type": "rewrite",
          "to": "/api"
        },
        "/api/create": "http://localhost:${backendPort}"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    const requestBody = JSON.stringify({ name: 'John Doe' });

    // POST request with body
    const response = await makeRequest(proxyPort, '/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(requestBody.length),
      },
      body: requestBody,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Created');

    // Backend receives original URL and body
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('/create');
    expect(requests[0].body).toBe(requestBody);
  });

  it('should handle multiple rewrite rules independently', async () => {
    const mockBackend1 = new MockBackendServer({ responseBody: 'V2 API' });
    const mockBackend2 = new MockBackendServer({ responseBody: 'Admin Panel' });

    const port1 = await mockBackend1.start();
    const port2 = await mockBackend2.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/v1": {
          "type": "rewrite",
          "to": "/v2"
        },
        "/v2/v1": "http://localhost:${port1}",
        "/old-admin": {
          "type": "rewrite",
          "to": "/admin"
        },
        "/admin/old-admin": "http://localhost:${port2}"
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend1.clearRequestLog();
    mockBackend2.clearRequestLog();

    // Test first rewrite rule: /v1 -> /v2/v1
    const r1 = await makeRequest(proxyPort, '/v1');
    expect(r1.statusCode).toBe(200);
    expect(r1.body).toBe('V2 API');
    expect(mockBackend1.getRequestLog()).toHaveLength(1);

    // Test second rewrite rule: /old-admin -> /admin/old-admin
    const r2 = await makeRequest(proxyPort, '/old-admin');
    expect(r2.statusCode).toBe(200);
    expect(r2.body).toBe('Admin Panel');
    expect(mockBackend2.getRequestLog()).toHaveLength(1);

    await mockBackend1.stop();
    await mockBackend2.stop();
  });
});

describe('ProxyServer - Rewrite with Virtual Hosts', () => {
  let mockBackend: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8781;

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend) await mockBackend.stop();
  });

  it('should rewrite within virtual host', async () => {
    mockBackend = new MockBackendServer({ responseBody: 'API Response' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "hosts": {
          "api.example.com": {
            "/v1": {
              "type": "rewrite",
              "to": "/v2"
            },
            "/v2/v1": "http://localhost:${backendPort}"
          }
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    const response = await makeRequest(proxyPort, '/v1', {
      headers: { Host: 'api.example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('API Response');

    // Backend receives original URL
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/v1');
  });

  it('should handle rewrite with wildcard in virtual hosts', async () => {
    mockBackend = new MockBackendServer({ responseBody: 'Fallback Backend' });
    const backendPort = await mockBackend.start();

    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "hosts": {
          "api.example.com": {
            "/legacy": {
              "type": "rewrite",
              "to": "/modern"
            },
            "*": "http://localhost:${backendPort}"
          }
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
    mockBackend.clearRequestLog();

    // Rewrite /legacy -> /modern/legacy
    // Wildcard proxy (*) matches the rewritten path
    // Backend receives original URL when wildcard proxy matches
    const response = await makeRequest(proxyPort, '/legacy', {
      headers: { Host: 'api.example.com' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('Fallback Backend');

    // Backend receives the original URL (not rewritten)
    const requests = mockBackend.getRequestLog();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/legacy');
  });
});
