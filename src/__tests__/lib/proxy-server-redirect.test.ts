import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProxyServer } from '@/lib/proxy-server';
import { ProxyConfig } from '@/lib/proxy-config';
import { MockBackendServer } from '../utils/mock-backend-server';
import { makeRequest } from '../utils/test-helpers';
import { waitForServer } from '../utils/wait-for-server';

/**
 * Integration tests for redirect rule functionality
 */
describe('ProxyServer - Redirect Rules', () => {
  let proxyServer: ProxyServer;
  const proxyPort = 8775;

  afterEach(() => {
    if (proxyServer) proxyServer.stop();
  });

  it('should return 302 redirect by default', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/old": {
          "type": "redirect",
          "to": "/new"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    const response = await makeRequest(proxyPort, '/old');

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/new');
  });

  it('should return 301 permanent redirect when specified', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/old-page": {
          "type": "redirect",
          "to": "/new-page",
          "status": 301
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    const response = await makeRequest(proxyPort, '/old-page');

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('/new-page');
  });

  it('should return 307 temporary redirect when specified', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/temp": {
          "type": "redirect",
          "to": "/temporary-location",
          "status": 307
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    const response = await makeRequest(proxyPort, '/temp');

    expect(response.statusCode).toBe(307);
    expect(response.headers.location).toBe('/temporary-location');
  });

  it('should return 308 permanent redirect when specified', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/permanent": {
          "type": "redirect",
          "to": "https://newsite.com",
          "status": 308
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    const response = await makeRequest(proxyPort, '/permanent');

    expect(response.statusCode).toBe(308);
    expect(response.headers.location).toBe('https://newsite.com');
  });

  it('should redirect to absolute URL', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/external": {
          "type": "redirect",
          "to": "https://example.com/page"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    const response = await makeRequest(proxyPort, '/external');

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://example.com/page');
  });

  it('should redirect to relative path', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/docs": {
          "type": "redirect",
          "to": "/documentation"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    const response = await makeRequest(proxyPort, '/docs');

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/documentation');
  });
});

describe('ProxyServer - Redirect with strip_prefix', () => {
  let proxyServer: ProxyServer;
  const proxyPort = 8776;

  afterEach(() => {
    if (proxyServer) proxyServer.stop();
  });

  it('should strip prefix from URL before redirecting', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "*": {
          "type": "redirect",
          "to": "https://cdn.example.com",
          "strip_prefix": "/static"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    // Request: /static/images/logo.png
    // Expected: https://cdn.example.com/images/logo.png
    const response = await makeRequest(proxyPort, '/static/images/logo.png');

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://cdn.example.com/images/logo.png');
  });

  it('should handle strip_prefix with wildcard path', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "*": {
          "type": "redirect",
          "to": "https://api.example.com/v2",
          "strip_prefix": "/old-api",
          "status": 301
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    // Request: /old-api/users
    // Expected: https://api.example.com/v2/users
    const response = await makeRequest(proxyPort, '/old-api/users');

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('https://api.example.com/v2/users');
  });

  it('should redirect without stripping when strip_prefix not specified', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/legacy": {
          "type": "redirect",
          "to": "/new-api"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    // Request: /legacy (exact path match)
    // Expected: /new-api (no appending since no strip_prefix)
    const response = await makeRequest(proxyPort, '/legacy');

    expect(response.statusCode).toBe(302);
    // Without strip_prefix, just redirect to the target
    expect(response.headers.location).toBe('/new-api');
  });
});

describe('ProxyServer - Redirect without Backend Connection', () => {
  let mockBackend: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8777;

  beforeEach(async () => {
    // Start a backend but it should NOT receive any requests
    mockBackend = new MockBackendServer({ responseBody: 'Should not be called' });
    await mockBackend.start();
  });

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend) await mockBackend.stop();
  });

  it('should not connect to backend for redirect rules', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/redirect-me": {
          "type": "redirect",
          "to": "https://example.com"
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    mockBackend.clearRequestLog();

    const response = await makeRequest(proxyPort, '/redirect-me');

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://example.com');

    // Backend should have received ZERO requests
    expect(mockBackend.getRequestLog()).toHaveLength(0);
  });
});

describe('ProxyServer - Redirect with POST Request', () => {
  let proxyServer: ProxyServer;
  const proxyPort = 8778;

  afterEach(() => {
    if (proxyServer) proxyServer.stop();
  });

  it('should redirect POST request with 307 to preserve method', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/api/v1": {
          "type": "redirect",
          "to": "/api/v2",
          "status": 307
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    const response = await makeRequest(proxyPort, '/api/v1', {
      method: 'POST',
      body: '{"name":"test"}',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(response.statusCode).toBe(307);
    expect(response.headers.location).toBe('/api/v2');
  });

  it('should redirect immediately without consuming request body', async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/upload": {
          "type": "redirect",
          "to": "https://cdn.example.com/upload",
          "status": 301
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);

    // Large body - redirect should happen immediately
    const largeBody = 'x'.repeat(10000);
    const response = await makeRequest(proxyPort, '/upload', {
      method: 'POST',
      body: largeBody
    });

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('https://cdn.example.com/upload');
  });
});

describe('ProxyServer - Multiple Redirect Rules', () => {
  let proxyServer: ProxyServer;
  const proxyPort = 8779;

  beforeEach(async () => {
    const config = ProxyConfig.loadFromString(`{
      "${proxyPort}": {
        "/old-docs": {
          "type": "redirect",
          "to": "/documentation",
          "status": 301
        },
        "/old-api": {
          "type": "redirect",
          "to": "https://api.example.com",
          "status": 301
        },
        "/temp": {
          "type": "redirect",
          "to": "/temporary",
          "status": 307
        }
      }
    }`);

    proxyServer = new ProxyServer(config);
    proxyServer.start();
    await waitForServer(proxyPort);
  });

  afterEach(() => {
    if (proxyServer) proxyServer.stop();
  });

  it('should handle multiple redirect rules independently', async () => {
    const r1 = await makeRequest(proxyPort, '/old-docs');
    const r2 = await makeRequest(proxyPort, '/old-api');
    const r3 = await makeRequest(proxyPort, '/temp');

    expect(r1.statusCode).toBe(301);
    expect(r1.headers.location).toBe('/documentation');

    expect(r2.statusCode).toBe(301);
    expect(r2.headers.location).toBe('https://api.example.com');

    expect(r3.statusCode).toBe(307);
    expect(r3.headers.location).toBe('/temporary');
  });
});
