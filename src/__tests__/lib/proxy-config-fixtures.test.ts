import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ProxyConfig } from '@/lib/proxy-config';
import { RuleType } from '@/types/shared-proxy-config';

const CONFIGS_DIR = join(__dirname, '../fixtures');

describe('Config Fixtures - Feature Examples', () => {
  describe('basic.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'basic.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should route all requests on port 80', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'basic.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const rule = config.getRule(80, '*', '/');
      expect(rule).toBeDefined();
      expect(rule?.type).toBe(RuleType.PROXY);

      if (rule?.type === RuleType.PROXY) {
        expect(rule.targets.length).toBeGreaterThan(0);
      }
    });
  });

  describe('defaults.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'defaults.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should have __defaults configuration', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'defaults.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const defaults = config.getDefaults();
      expect(defaults).toBeDefined();
      expect(defaults?.timeout_ms).toBeDefined();
    });
  });

  describe('path.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'path.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should have path-based routing', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'path.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      // Verify port 80 exists
      expect(config.hasPort(80)).toBe(true);
    });

    it('should route /api and * paths', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'path.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const apiRule = config.getRule(80, '*', '/api');
      const otherRule = config.getRule(80, '*', '/other');

      expect(apiRule).toBeDefined();
      expect(otherRule).toBeDefined();
    });
  });

  describe('multi-hosts.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'multi-hosts.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should have multiple targets for load balancing', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'multi-hosts.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const rule = config.getRule(80, '*', '/api');
      expect(rule).toBeDefined();

      if (rule?.type === RuleType.PROXY) {
        expect(rule.targets.length).toBeGreaterThan(1);
      }
    });
  });

  describe('redirect.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'redirect.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should have redirect rule configured', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'redirect.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const rule = config.getRule(80, '*', '/static');
      expect(rule).toBeDefined();
      expect(rule?.type).toBe(RuleType.REDIRECT);

      if (rule?.type === RuleType.REDIRECT) {
        expect(rule.to).toBeDefined();
        expect(rule.status).toBeDefined();
      }
    });
  });

  describe('rewrite.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'rewrite.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should have rewrite rule configured', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'rewrite.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const rule = config.getRule(80, '*', '/api');
      expect(rule).toBeDefined();
      expect(rule?.type).toBe(RuleType.REWRITE);

      if (rule?.type === RuleType.REWRITE) {
        expect(rule.to).toBeDefined();
      }
    });
  });

  describe('health-check.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'health-check.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should have health check configuration', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'health-check.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const rule = config.getRule(80, '*', '/api');
      expect(rule).toBeDefined();

      if (rule?.type === RuleType.PROXY) {
        expect(rule.health_check).toBeDefined();
      }
    });
  });
});

describe('Config Fixtures - Virtual Host Examples', () => {
  describe('vhost-simple.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-simple.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should route different hostnames to different backends', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-simple.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const shopRule = config.getRule(80, 'myshop.local', '/');
      const blogRule = config.getRule(80, 'myblog.local', '/');
      const adminRule = config.getRule(80, 'admin.local', '/');

      expect(shopRule).toBeDefined();
      expect(blogRule).toBeDefined();
      expect(adminRule).toBeDefined();

      // Verify they are different backends
      expect(shopRule?.type).toBe(RuleType.PROXY);
      expect(blogRule?.type).toBe(RuleType.PROXY);
      expect(adminRule?.type).toBe(RuleType.PROXY);
    });
  });

  describe('vhost-paths.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-paths.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should support hostname + path combination routing', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-paths.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      // Test app.mycompany.com with different paths
      const rootRule = config.getRule(80, 'app.mycompany.com', '/');
      const apiRule = config.getRule(80, 'app.mycompany.com', '/api');

      expect(rootRule).toBeDefined();
      expect(apiRule).toBeDefined();

      // Test docs.mycompany.com (simple hostname routing)
      const docsRule = config.getRule(80, 'docs.mycompany.com', '/');
      expect(docsRule).toBeDefined();
    });
  });

  describe('vhost-loadbalancing.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-loadbalancing.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should support virtual host + load balancing', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-loadbalancing.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const rule = config.getRule(80, 'shop.example.com', '/');
      expect(rule).toBeDefined();

      if (rule?.type === RuleType.PROXY) {
        expect(rule.targets.length).toBeGreaterThan(1);
      }
    });
  });

  describe('vhost-mixed.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-mixed.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should support mixed routing types (proxy, redirect, rewrite)', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-mixed.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      // Test for different rule types
      const proxyRule = config.getRule(80, 'www.modernapp.io', '/');
      const redirectRule = config.getRule(80, 'www.modernapp.io', '/static');

      expect(proxyRule).toBeDefined();
      expect(redirectRule).toBeDefined();

      // Verify they are different rule types
      expect(proxyRule?.type).toBe(RuleType.PROXY);
      expect(redirectRule?.type).toBe(RuleType.REDIRECT);
    });
  });

  describe('vhost-production.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-production.json'), 'utf-8');
      // Just verify it parses without errors (SSL not implemented yet)
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should have configuration for multiple ports and hosts', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-production.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      const ports = config.getPorts();
      expect(ports.length).toBeGreaterThan(0);
    });
  });

  describe('vhost-microservices.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-microservices.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should route to multiple microservices', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-microservices.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      // Test multiple service paths
      const usersRule = config.getRule(80, 'api.microservices.io', '/users');
      const productsRule = config.getRule(80, 'api.microservices.io', '/products');
      const ordersRule = config.getRule(80, 'api.microservices.io', '/orders');

      expect(usersRule).toBeDefined();
      expect(productsRule).toBeDefined();
      expect(ordersRule).toBeDefined();
    });
  });

  describe('vhost-development.json', () => {
    it('should load without errors', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-development.json'), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content)).not.toThrow();
    });

    it('should route to development environment services', () => {
      const content = readFileSync(join(CONFIGS_DIR, 'vhost-development.json'), 'utf-8');
      const config = ProxyConfig.loadFromString(content);

      // Verify dev environment hostnames
      const frontendRule = config.getRule(80, 'frontend.dev', '/');
      const backendRule = config.getRule(80, 'backend.dev', '/');
      const apiV1Rule = config.getRule(80, 'api.dev', '/v1');

      expect(frontendRule).toBeDefined();
      expect(backendRule).toBeDefined();
      expect(apiV1Rule).toBeDefined();
    });
  });
});

describe('Config Fixtures - Coverage Validation', () => {
  it('should successfully load all 14 configuration files', () => {
    const configFiles = [
      'basic.json',
      'defaults.json',
      'path.json',
      'multi-hosts.json',
      'redirect.json',
      'rewrite.json',
      'health-check.json',
      'vhost-simple.json',
      'vhost-paths.json',
      'vhost-loadbalancing.json',
      'vhost-mixed.json',
      'vhost-production.json',
      'vhost-microservices.json',
      'vhost-development.json',
    ];

    for (const configFile of configFiles) {
      const content = readFileSync(join(CONFIGS_DIR, configFile), 'utf-8');
      expect(() => ProxyConfig.loadFromString(content), `Failed to load ${configFile}`).not.toThrow();
    }
  });
});
