import { describe, it, expect } from 'vitest';
import { ProxyConfig } from '@/lib/proxy-config';

/**
 * Unit tests for TLS configuration parsing in ProxyConfig
 */
describe('ProxyConfig - TLS Configuration', () => {
  describe('TLS Configuration Parsing', () => {
    it('should parse TLS configuration with path mappings', () => {
      const config = ProxyConfig.loadFromString(`{
        "443": {
          "tls": {
            "cert": "/path/to/cert.pem",
            "key": "/path/to/key.pem"
          },
          "/api": "http://backend:9000",
          "*": "http://frontend:3000"
        }
      }`);

      const tlsConfig = config.getTLSConfig(443);
      expect(tlsConfig).toBeDefined();
      expect(tlsConfig?.cert).toBe('/path/to/cert.pem');
      expect(tlsConfig?.key).toBe('/path/to/key.pem');
      expect(tlsConfig?.ca).toBeUndefined();

      // Verify rules are still parsed correctly
      const apiRule = config.getRule(443, '*', '/api');
      expect(apiRule).toBeDefined();
      expect(apiRule?.type).toBe('proxy');

      const wildcardRule = config.getRule(443, '*', '/');
      expect(wildcardRule).toBeDefined();
      expect(wildcardRule?.type).toBe('proxy');
    });

    it('should parse TLS configuration with CA bundle', () => {
      const config = ProxyConfig.loadFromString(`{
        "443": {
          "tls": {
            "cert": "/path/to/cert.pem",
            "key": "/path/to/key.pem",
            "ca": "/path/to/ca.pem"
          },
          "*": "http://backend:3000"
        }
      }`);

      const tlsConfig = config.getTLSConfig(443);
      expect(tlsConfig).toBeDefined();
      expect(tlsConfig?.cert).toBe('/path/to/cert.pem');
      expect(tlsConfig?.key).toBe('/path/to/key.pem');
      expect(tlsConfig?.ca).toBe('/path/to/ca.pem');
    });

    it('should parse TLS configuration with virtual hosts', () => {
      const config = ProxyConfig.loadFromString(`{
        "443": {
          "tls": {
            "cert": "/path/to/cert.pem",
            "key": "/path/to/key.pem"
          },
          "hosts": {
            "api.example.com": "http://api:9000",
            "web.example.com": "http://web:3000"
          }
        }
      }`);

      const tlsConfig = config.getTLSConfig(443);
      expect(tlsConfig).toBeDefined();
      expect(tlsConfig?.cert).toBe('/path/to/cert.pem');
      expect(tlsConfig?.key).toBe('/path/to/key.pem');

      // Verify virtual host routing still works
      const apiRule = config.getRule(443, 'api.example.com', '/');
      expect(apiRule).toBeDefined();

      const webRule = config.getRule(443, 'web.example.com', '/');
      expect(webRule).toBeDefined();
    });

    it('should return undefined for ports without TLS configuration', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": "http://backend:3000"
      }`);

      const tlsConfig = config.getTLSConfig(80);
      expect(tlsConfig).toBeUndefined();
    });

    it('should handle mixed HTTP and HTTPS ports', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/": "http://backend:3000"
        },
        "443": {
          "tls": {
            "cert": "/path/to/cert.pem",
            "key": "/path/to/key.pem"
          },
          "/": "http://backend:3000"
        }
      }`);

      const httpTlsConfig = config.getTLSConfig(80);
      expect(httpTlsConfig).toBeUndefined();

      const httpsTlsConfig = config.getTLSConfig(443);
      expect(httpsTlsConfig).toBeDefined();
      expect(httpsTlsConfig?.cert).toBe('/path/to/cert.pem');
      expect(httpsTlsConfig?.key).toBe('/path/to/key.pem');

      // Verify both ports have correct rules
      const httpRule = config.getRule(80, '*', '/');
      expect(httpRule).toBeDefined();

      const httpsRule = config.getRule(443, '*', '/');
      expect(httpsRule).toBeDefined();
    });

    it('should not include tls key in path mappings', () => {
      const config = ProxyConfig.loadFromString(`{
        "443": {
          "tls": {
            "cert": "/path/to/cert.pem",
            "key": "/path/to/key.pem"
          },
          "/api": "http://api:9000",
          "/web": "http://web:3000"
        }
      }`);

      // Should have TLS config
      const tlsConfig = config.getTLSConfig(443);
      expect(tlsConfig).toBeDefined();

      // Should have /api and /web paths
      const apiRule = config.getRule(443, '*', '/api');
      expect(apiRule).toBeDefined();

      const webRule = config.getRule(443, '*', '/web');
      expect(webRule).toBeDefined();

      // Should NOT have /tls path
      const tlsRule = config.getRule(443, '*', '/tls');
      expect(tlsRule).toBeUndefined();

      // Verify paths
      const paths = config.getPaths(443);
      expect(paths).toContain('/api');
      expect(paths).toContain('/web');
      expect(paths).not.toContain('tls');
      expect(paths).not.toContain('/tls');
    });

    it('should support redirect rules with TLS', () => {
      const config = ProxyConfig.loadFromString(`{
        "443": {
          "tls": {
            "cert": "/path/to/cert.pem",
            "key": "/path/to/key.pem"
          },
          "/old": {
            "type": "redirect",
            "to": "/new",
            "status": 301
          }
        }
      }`);

      const tlsConfig = config.getTLSConfig(443);
      expect(tlsConfig).toBeDefined();

      const redirectRule = config.getRule(443, '*', '/old');
      expect(redirectRule).toBeDefined();
      expect(redirectRule?.type).toBe('redirect');
    });

    it('should support rewrite rules with TLS', () => {
      const config = ProxyConfig.loadFromString(`{
        "443": {
          "tls": {
            "cert": "/path/to/cert.pem",
            "key": "/path/to/key.pem"
          },
          "/api": {
            "type": "rewrite",
            "to": "/v1/api"
          }
        }
      }`);

      const tlsConfig = config.getTLSConfig(443);
      expect(tlsConfig).toBeDefined();

      const rewriteRule = config.getRule(443, '*', '/api');
      expect(rewriteRule).toBeDefined();
      expect(rewriteRule?.type).toBe('rewrite');
    });

    it('should support load balancing with TLS', () => {
      const config = ProxyConfig.loadFromString(`{
        "443": {
          "tls": {
            "cert": "/path/to/cert.pem",
            "key": "/path/to/key.pem"
          },
          "/api": {
            "type": "proxy",
            "to": [
              "http://backend1:9000",
              "http://backend2:9000",
              "http://backend3:9000"
            ]
          }
        }
      }`);

      const tlsConfig = config.getTLSConfig(443);
      expect(tlsConfig).toBeDefined();

      const proxyRule = config.getRule(443, '*', '/api');
      expect(proxyRule).toBeDefined();
      expect(proxyRule?.type).toBe('proxy');
      if (proxyRule?.type === 'proxy') {
        expect(proxyRule.targets).toHaveLength(3);
      }
    });
  });

  describe('Configuration Examples', () => {
    it('should parse simple HTTPS configuration', () => {
      const config = ProxyConfig.loadFromString(`{
        "443": {
          "tls": {
            "cert": "/etc/ssl/certs/server.crt",
            "key": "/etc/ssl/private/server.key"
          },
          "*": "http://localhost:3000"
        }
      }`);

      expect(config.getTLSConfig(443)).toBeDefined();
      expect(config.getRule(443, '*', '/')).toBeDefined();
    });

    it('should parse HTTP to HTTPS redirect configuration', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/": {
            "type": "redirect",
            "to": "https://example.com",
            "status": 301
          }
        },
        "443": {
          "tls": {
            "cert": "/etc/ssl/certs/server.crt",
            "key": "/etc/ssl/private/server.key"
          },
          "/api": "http://backend:9001",
          "*": "http://frontend:3000"
        }
      }`);

      expect(config.getTLSConfig(80)).toBeUndefined();
      expect(config.getTLSConfig(443)).toBeDefined();

      const httpRule = config.getRule(80, '*', '/');
      expect(httpRule?.type).toBe('redirect');

      const apiRule = config.getRule(443, '*', '/api');
      expect(apiRule?.type).toBe('proxy');
    });
  });
});
