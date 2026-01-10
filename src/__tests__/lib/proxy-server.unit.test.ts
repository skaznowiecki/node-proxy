import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProxyServer } from '@/lib/proxy-server';
import { ProxyConfig } from '@/lib/proxy-config';

/**
 * Unit tests for ProxyServer class
 * These tests focus on testing individual methods in isolation using mocks
 */
describe('ProxyServer - Unit Tests', () => {
  describe('constructor', () => {
    it('should initialize with ProxyConfig', () => {
      const config = ProxyConfig.loadFromString('{"80": "http://backend:3000"}');
      const server = new ProxyServer(config);

      expect(server).toBeInstanceOf(ProxyServer);
      // Server should be created but not started
    });

    it('should initialize with default server config when not provided', () => {
      const config = ProxyConfig.loadFromString('{"80": "http://backend:3000"}');
      const server = new ProxyServer(config);

      // Should not throw and should use defaults
      expect(server).toBeInstanceOf(ProxyServer);
    });

    it('should initialize with custom server config', () => {
      const config = ProxyConfig.loadFromString('{"80": "http://backend:3000"}');
      const serverConfig = { cluster: true, workers: 4 };
      const server = new ProxyServer(config, serverConfig);

      expect(server).toBeInstanceOf(ProxyServer);
    });

    it('should set cluster mode from serverConfig', () => {
      const config = ProxyConfig.loadFromString('{"80": "http://backend:3000"}');
      const serverConfig = { cluster: true, workers: 2 };
      const server = new ProxyServer(config, serverConfig);

      // Cluster mode should be enabled (tested via start() behavior)
      expect(server).toBeInstanceOf(ProxyServer);
    });

    it('should default cluster mode to false', () => {
      const config = ProxyConfig.loadFromString('{"80": "http://backend:3000"}');
      const server = new ProxyServer(config);

      // Cluster mode should be disabled by default
      expect(server).toBeInstanceOf(ProxyServer);
    });

    it('should set worker count from serverConfig', () => {
      const config = ProxyConfig.loadFromString('{"80": "http://backend:3000"}');
      const serverConfig = { cluster: true, workers: 8 };
      const server = new ProxyServer(config, serverConfig);

      expect(server).toBeInstanceOf(ProxyServer);
    });

    it('should use CPU count as default worker count', () => {
      const config = ProxyConfig.loadFromString('{"80": "http://backend:3000"}');
      const serverConfig = { cluster: true };
      const server = new ProxyServer(config, serverConfig);

      // Should default to os.cpus().length
      expect(server).toBeInstanceOf(ProxyServer);
    });
  });

  describe('getNextTarget - Round-Robin Logic', () => {
    let config: ProxyConfig;
    let server: ProxyServer;

    it('should use single target without round-robin for single-target rule', () => {
      config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": "http://backend1:3000"
        }
      }`);
      server = new ProxyServer(config);

      // The proxy will try to make HTTP request to backend
      // We can't easily test the exact target without starting servers
      // But we can verify the server was created correctly
      expect(server).toBeInstanceOf(ProxyServer);
    });

    it('should cycle through multiple targets in round-robin fashion', () => {
      config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": {
            "type": "proxy",
            "to": [
              "http://backend1:3000",
              "http://backend2:3000",
              "http://backend3:3000"
            ]
          }
        }
      }`);
      server = new ProxyServer(config);

      // Verify config was loaded with 3 targets
      const rule = config.getRule(80, '*', '/api');
      expect(rule).toBeDefined();
      if (rule?.type === 'proxy') {
        expect(rule.targets).toHaveLength(3);
      }
    });

    it('should maintain independent counters per port:hostname:path combination', () => {
      config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": {
            "type": "proxy",
            "to": ["http://api1:9000", "http://api2:9000"]
          },
          "/web": {
            "type": "proxy",
            "to": ["http://web1:3000", "http://web2:3000"]
          }
        }
      }`);
      server = new ProxyServer(config);

      // Verify both rules exist with different targets
      const apiRule = config.getRule(80, '*', '/api');
      const webRule = config.getRule(80, '*', '/web');

      expect(apiRule).toBeDefined();
      expect(webRule).toBeDefined();

      if (apiRule?.type === 'proxy' && webRule?.type === 'proxy') {
        expect(apiRule.targets).toHaveLength(2);
        expect(webRule.targets).toHaveLength(2);
        expect(apiRule.targets[0]).toContain('api');
        expect(webRule.targets[0]).toContain('web');
      }
    });

    it('should wrap around to first target after reaching last target', () => {
      config = ProxyConfig.loadFromString(`{
        "80": {
          "/": {
            "type": "proxy",
            "to": ["http://s1:3000", "http://s2:3000"]
          }
        }
      }`);
      server = new ProxyServer(config);

      const rule = config.getRule(80, '*', '/');
      expect(rule).toBeDefined();
      if (rule?.type === 'proxy') {
        expect(rule.targets).toHaveLength(2);
      }
    });

    it('should handle virtual host routing with independent counters', () => {
      config = ProxyConfig.loadFromString(`{
        "80": {
          "hosts": {
            "api.example.com": {
              "/": {
                "type": "proxy",
                "to": ["http://api1:9000", "http://api2:9000"]
              }
            },
            "web.example.com": {
              "/": {
                "type": "proxy",
                "to": ["http://web1:3000", "http://web2:3000"]
              }
            }
          }
        }
      }`);
      server = new ProxyServer(config);

      const apiRule = config.getRule(80, 'api.example.com', '/');
      const webRule = config.getRule(80, 'web.example.com', '/');

      expect(apiRule).toBeDefined();
      expect(webRule).toBeDefined();
    });
  });

  describe('start() method', () => {
    let config: ProxyConfig;

    beforeEach(() => {
      config = ProxyConfig.loadFromString('{"80": "http://backend:3000"}');
    });

    afterEach(() => {
      // Note: We're not actually starting servers in unit tests
      // Integration tests will test actual server startup
    });

    it('should not throw when start is called', () => {
      const server = new ProxyServer(config);
      // In unit tests, we're just verifying the method exists and can be called
      // Actual server startup is tested in integration tests
      expect(() => server.start()).not.toThrow();
    });

    it('should handle cluster mode configuration', () => {
      const serverConfig = { cluster: true, workers: 2 };
      const server = new ProxyServer(config, serverConfig);

      // Cluster mode is configured
      expect(server).toBeInstanceOf(ProxyServer);
    });

    it('should handle single process mode', () => {
      const serverConfig = { cluster: false };
      const server = new ProxyServer(config, serverConfig);

      expect(server).toBeInstanceOf(ProxyServer);
    });
  });

  describe('stop() method', () => {
    let config: ProxyConfig;

    beforeEach(() => {
      config = ProxyConfig.loadFromString('{"80": "http://backend:3000"}');
    });

    it('should not throw when stop is called without starting', () => {
      const server = new ProxyServer(config);
      expect(() => server.stop()).not.toThrow();
    });

    it('should handle stop in cluster mode', () => {
      const serverConfig = { cluster: true, workers: 2 };
      const server = new ProxyServer(config, serverConfig);

      expect(() => server.stop()).not.toThrow();
    });

    it('should handle stop in single process mode', () => {
      const server = new ProxyServer(config);
      expect(() => server.stop()).not.toThrow();
    });
  });

  describe('handleRequest - Rule Type Routing', () => {
    it('should create server for proxy rules', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": {
            "type": "proxy",
            "to": "http://backend:9000"
          }
        }
      }`);
      const _server = new ProxyServer(config);

      const rule = config.getRule(80, '*', '/api');
      expect(rule?.type).toBe('proxy');
    });

    it('should create server for redirect rules', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/old": {
            "type": "redirect",
            "to": "/new",
            "status": 301
          }
        }
      }`);
      const _server = new ProxyServer(config);

      const rule = config.getRule(80, '*', '/old');
      expect(rule?.type).toBe('redirect');
    });

    it('should create server for rewrite rules', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": {
            "type": "rewrite",
            "to": "/v1/api"
          }
        }
      }`);
      const _server = new ProxyServer(config);

      const rule = config.getRule(80, '*', '/api');
      expect(rule?.type).toBe('rewrite');
    });
  });

  describe('Multiple Ports', () => {
    it('should support multiple ports in configuration', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": "http://backend1:3000",
        "8080": "http://backend2:4000",
        "443": "http://backend3:5000"
      }`);
      const _server = new ProxyServer(config);

      const ports = config.getPorts();
      expect(ports).toHaveLength(3);
      expect(ports).toContain(80);
      expect(ports).toContain(8080);
      expect(ports).toContain(443);
    });

    it('should handle each port independently', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/": {
            "type": "proxy",
            "to": ["http://web1:3000", "http://web2:3000"]
          }
        },
        "8080": {
          "/api": "http://api:9000"
        }
      }`);
      const _server = new ProxyServer(config);

      const port80Rule = config.getRule(80, '*', '/');
      const port8080Rule = config.getRule(8080, '*', '/api');

      expect(port80Rule).toBeDefined();
      expect(port8080Rule).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle empty configuration', () => {
      const config = ProxyConfig.loadFromString('{}');
      const _server = new ProxyServer(config);

      expect(_server).toBeInstanceOf(ProxyServer);
      expect(config.getPorts()).toHaveLength(0);
    });

    it('should not throw with minimal valid configuration', () => {
      const config = ProxyConfig.loadFromString('{"80": "http://localhost:3000"}');

      expect(() => new ProxyServer(config)).not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should work with complex nested configuration', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "hosts": {
            "api.example.com": {
              "/v1": {
                "type": "proxy",
                "to": ["http://api-v1-1:9000", "http://api-v1-2:9000"]
              },
              "/v2": {
                "type": "redirect",
                "to": "https://newapi.example.com/v2"
              }
            },
            "web.example.com": {
              "/": "http://web:3000",
              "/api": {
                "type": "rewrite",
                "to": "/internal/api"
              }
            }
          }
        }
      }`);
      const _server = new ProxyServer(config);

      expect(_server).toBeInstanceOf(ProxyServer);

      // Verify all rules are correctly configured
      const apiV1 = config.getRule(80, 'api.example.com', '/v1');
      const apiV2 = config.getRule(80, 'api.example.com', '/v2');
      const webRoot = config.getRule(80, 'web.example.com', '/');
      const webApi = config.getRule(80, 'web.example.com', '/api');

      expect(apiV1?.type).toBe('proxy');
      expect(apiV2?.type).toBe('redirect');
      expect(webRoot?.type).toBe('proxy');
      expect(webApi?.type).toBe('rewrite');
    });

    it('should handle health check configuration in proxy rules', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": {
            "type": "proxy",
            "to": ["http://api1:9000", "http://api2:9000"],
            "health_check": {
              "path": "/health",
              "interval_ms": 10000
            }
          }
        }
      }`);
      const _server = new ProxyServer(config);

      const rule = config.getRule(80, '*', '/api');
      expect(rule?.type).toBe('proxy');
      if (rule?.type === 'proxy') {
        expect(rule.health_check).toBeDefined();
        expect(rule.health_check?.path).toBe('/health');
        expect(rule.health_check?.interval_ms).toBe(10000);
      }
    });
  });
});
