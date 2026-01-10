import { describe, it, expect, afterEach } from 'vitest';
import { ProxyServer } from '@/lib/proxy-server';
import { ProxyConfig } from '@/lib/proxy-config';
import { MockBackendServer } from '../utils/mock-backend-server';
import { makeRequest } from '../utils/test-helpers';
import { waitForServer } from '../utils/wait-for-server';

/**
 * Integration tests for X-Forwarded headers and Host header handling
 */
describe('ProxyServer - Header Handling', () => {
  let mockBackend: MockBackendServer;
  let proxyServer: ProxyServer;
  const proxyPort = 8795;

  afterEach(async () => {
    if (proxyServer) proxyServer.stop();
    if (mockBackend) await mockBackend.stop();
  });

  describe('X-Forwarded Headers', () => {
    it('should add X-Forwarded-* headers when x_forwarded is enabled', async () => {
      mockBackend = new MockBackendServer({
        responseBody: (req): string => {
          return JSON.stringify({
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-forwarded-host': req.headers['x-forwarded-host'],
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
          });
        },
      });
      const backendPort = await mockBackend.start();

      const config = ProxyConfig.loadFromString(`{
        "__defaults": {
          "headers": {
            "x_forwarded": true
          }
        },
        "${proxyPort}": "http://localhost:${backendPort}"
      }`);

      proxyServer = new ProxyServer(config);
      proxyServer.start();
      await waitForServer(proxyPort);
      mockBackend.clearRequestLog();

      const response = await makeRequest(proxyPort, '/test', {
        headers: { Host: 'example.com' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have X-Forwarded-For with client IP
      expect(body['x-forwarded-for']).toBeDefined();
      expect(typeof body['x-forwarded-for']).toBe('string');

      // Should have X-Forwarded-Host with original Host header
      expect(body['x-forwarded-host']).toBe('example.com');

      // Should have X-Forwarded-Proto as 'http'
      expect(body['x-forwarded-proto']).toBe('http');
    });

    it('should not add X-Forwarded-* headers when x_forwarded is disabled', async () => {
      mockBackend = new MockBackendServer({
        responseBody: (req): string => {
          return JSON.stringify({
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-forwarded-host': req.headers['x-forwarded-host'],
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
          });
        },
      });
      const backendPort = await mockBackend.start();

      const config = ProxyConfig.loadFromString(`{
        "__defaults": {
          "headers": {
            "x_forwarded": false
          }
        },
        "${proxyPort}": "http://localhost:${backendPort}"
      }`);

      proxyServer = new ProxyServer(config);
      proxyServer.start();
      await waitForServer(proxyPort);
      mockBackend.clearRequestLog();

      const response = await makeRequest(proxyPort, '/test', {
        headers: { Host: 'example.com' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should not have X-Forwarded headers
      expect(body['x-forwarded-for']).toBeUndefined();
      expect(body['x-forwarded-host']).toBeUndefined();
      expect(body['x-forwarded-proto']).toBeUndefined();
    });

    it('should not add X-Forwarded-* headers when defaults not configured', async () => {
      mockBackend = new MockBackendServer({
        responseBody: (req): string => {
          return JSON.stringify({
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-forwarded-host': req.headers['x-forwarded-host'],
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
          });
        },
      });
      const backendPort = await mockBackend.start();

      const config = ProxyConfig.loadFromString(`{
        "${proxyPort}": "http://localhost:${backendPort}"
      }`);

      proxyServer = new ProxyServer(config);
      proxyServer.start();
      await waitForServer(proxyPort);
      mockBackend.clearRequestLog();

      const response = await makeRequest(proxyPort, '/test');

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should not have X-Forwarded headers
      expect(body['x-forwarded-for']).toBeUndefined();
      expect(body['x-forwarded-host']).toBeUndefined();
      expect(body['x-forwarded-proto']).toBeUndefined();
    });

    it('should append to existing X-Forwarded-For header', async () => {
      mockBackend = new MockBackendServer({
        responseBody: (req): string => {
          return JSON.stringify({
            'x-forwarded-for': req.headers['x-forwarded-for'],
          });
        },
      });
      const backendPort = await mockBackend.start();

      const config = ProxyConfig.loadFromString(`{
        "__defaults": {
          "headers": {
            "x_forwarded": true
          }
        },
        "${proxyPort}": "http://localhost:${backendPort}"
      }`);

      proxyServer = new ProxyServer(config);
      proxyServer.start();
      await waitForServer(proxyPort);
      mockBackend.clearRequestLog();

      const response = await makeRequest(proxyPort, '/test', {
        headers: {
          'X-Forwarded-For': '192.168.1.1, 10.0.0.1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should append client IP to existing X-Forwarded-For
      expect(body['x-forwarded-for']).toContain('192.168.1.1, 10.0.0.1');
      // Client IP can be either ::1 (IPv6) or ::ffff:127.0.0.1 (IPv4-mapped)
      const forwardedFor = body['x-forwarded-for'] as string;
      const hasLocalhost = forwardedFor.includes('::1') ? true : forwardedFor.includes('::ffff:127.0.0.1');
      expect(hasLocalhost).toBe(true);
    });
  });

  describe('Host Header Handling', () => {
    it('should pass Host header when pass_host is enabled', async () => {
      mockBackend = new MockBackendServer({
        responseBody: (req): string => {
          return JSON.stringify({
            host: req.headers.host,
          });
        },
      });
      const backendPort = await mockBackend.start();

      const config = ProxyConfig.loadFromString(`{
        "__defaults": {
          "headers": {
            "pass_host": true
          }
        },
        "${proxyPort}": "http://localhost:${backendPort}"
      }`);

      proxyServer = new ProxyServer(config);
      proxyServer.start();
      await waitForServer(proxyPort);
      mockBackend.clearRequestLog();

      const response = await makeRequest(proxyPort, '/test', {
        headers: { Host: 'example.com:8080' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have original Host header
      expect(body.host).toBe('example.com:8080');
    });

    it('should remove Host header when pass_host is disabled (default)', async () => {
      mockBackend = new MockBackendServer({
        responseBody: (req): string => {
          return JSON.stringify({
            host: req.headers.host,
          });
        },
      });
      const backendPort = await mockBackend.start();

      const config = ProxyConfig.loadFromString(`{
        "${proxyPort}": "http://localhost:${backendPort}"
      }`);

      proxyServer = new ProxyServer(config);
      proxyServer.start();
      await waitForServer(proxyPort);
      mockBackend.clearRequestLog();

      const response = await makeRequest(proxyPort, '/test', {
        headers: { Host: 'example.com' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have backend host, not original Host header
      expect(body.host).toBe(`localhost:${backendPort}`);
    });

    it('should support both x_forwarded and pass_host together', async () => {
      mockBackend = new MockBackendServer({
        responseBody: (req): string => {
          return JSON.stringify({
            host: req.headers.host,
            'x-forwarded-for': req.headers['x-forwarded-for'],
            'x-forwarded-host': req.headers['x-forwarded-host'],
            'x-forwarded-proto': req.headers['x-forwarded-proto'],
          });
        },
      });
      const backendPort = await mockBackend.start();

      const config = ProxyConfig.loadFromString(`{
        "__defaults": {
          "headers": {
            "x_forwarded": true,
            "pass_host": true
          }
        },
        "${proxyPort}": "http://localhost:${backendPort}"
      }`);

      proxyServer = new ProxyServer(config);
      proxyServer.start();
      await waitForServer(proxyPort);
      mockBackend.clearRequestLog();

      const response = await makeRequest(proxyPort, '/test', {
        headers: { Host: 'api.example.com' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have both original Host and X-Forwarded headers
      expect(body.host).toBe('api.example.com');
      expect(body['x-forwarded-for']).toBeDefined();
      expect(body['x-forwarded-host']).toBe('api.example.com');
      expect(body['x-forwarded-proto']).toBe('http');
    });
  });
});
