import { describe, it, expect, vi } from 'vitest';
import { ProxyConfig } from '@/lib/proxy-config';
import { RuleType } from '@/types/shared-proxy-config';

describe('ProxyConfig - Basic Configuration Parsing', () => {
  it('should parse simple port -> URL string', () => {
    const config = ProxyConfig.loadFromString('{"80": "http://localhost:3000"}');
    const rule = config.getRule(80, '*', '/');
    expect(rule).toBeDefined();
    expect(rule?.type).toBe(RuleType.PROXY);
    if (rule?.type === RuleType.PROXY) {
      expect(rule.targets).toEqual(['http://localhost:3000']);
    }
  });

  it('should parse port -> path -> URL', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/api": "http://localhost:9000",
        "/web": "http://localhost:3000"
      }
    }`);

    const apiRule = config.getRule(80, '*', '/api');
    const webRule = config.getRule(80, '*', '/web');

    expect(apiRule).toBeDefined();
    expect(webRule).toBeDefined();
    expect(apiRule?.type).toBe(RuleType.PROXY);
    expect(webRule?.type).toBe(RuleType.PROXY);
  });

  it('should throw error for invalid JSON', () => {
    expect(() => ProxyConfig.loadFromString('invalid json'))
      .toThrow('Failed to parse proxy configuration');
  });

  it('should warn and skip invalid port', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = ProxyConfig.loadFromString('{"99999": "http://localhost:3000"}');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: 99999')
    );
    expect(config.getPorts()).toHaveLength(0);
    consoleWarnSpy.mockRestore();
  });

  it('should warn and skip port 0', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = ProxyConfig.loadFromString('{"0": "http://localhost:3000"}');
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(config.getPorts()).toHaveLength(0);
    consoleWarnSpy.mockRestore();
  });

  it('should handle empty configuration', () => {
    const config = ProxyConfig.loadFromString('{}');
    expect(config.getPorts()).toHaveLength(0);
  });
});

describe('ProxyConfig - Virtual Host Parsing', () => {
  it('should parse hosts key with hostname mapping', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "hosts": {
          "myshop.local": "http://localhost:3000",
          "myblog.local": "http://localhost:4000"
        }
      }
    }`);

    const shopRule = config.getRule(80, 'myshop.local', '/');
    const blogRule = config.getRule(80, 'myblog.local', '/');

    expect(shopRule).toBeDefined();
    expect(blogRule).toBeDefined();
    expect(shopRule?.type).toBe(RuleType.PROXY);
    expect(blogRule?.type).toBe(RuleType.PROXY);
  });

  it('should support hostname + path routing', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "hosts": {
          "app.example.com": {
            "/": "http://frontend:3000",
            "/api": "http://api:9000"
          }
        }
      }
    }`);

    const rootRule = config.getRule(80, 'app.example.com', '/');
    const apiRule = config.getRule(80, 'app.example.com', '/api');

    expect(rootRule).toBeDefined();
    expect(apiRule).toBeDefined();
    expect(rootRule?.type).toBe(RuleType.PROXY);
    expect(apiRule?.type).toBe(RuleType.PROXY);
  });

  it('should support multiple virtual hosts with different path mappings', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "hosts": {
          "shop.example.com": {
            "/": "http://shop-frontend:3000",
            "/api": "http://shop-api:9000"
          },
          "blog.example.com": {
            "/": "http://blog-frontend:3001",
            "/api": "http://blog-api:9001"
          }
        }
      }
    }`);

    const shopRoot = config.getRule(80, 'shop.example.com', '/');
    const shopApi = config.getRule(80, 'shop.example.com', '/api');
    const blogRoot = config.getRule(80, 'blog.example.com', '/');
    const blogApi = config.getRule(80, 'blog.example.com', '/api');

    expect(shopRoot).toBeDefined();
    expect(shopApi).toBeDefined();
    expect(blogRoot).toBeDefined();
    expect(blogApi).toBeDefined();
  });
});

describe('ProxyConfig - Rule Types', () => {
  it('should parse redirect rule', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/old": {
          "type": "redirect",
          "to": "/new",
          "status": 301
        }
      }
    }`);

    const rule = config.getRule(80, '*', '/old');
    expect(rule?.type).toBe(RuleType.REDIRECT);
    if (rule?.type === RuleType.REDIRECT) {
      expect(rule.to).toBe('/new');
      expect(rule.status).toBe(301);
    }
  });

  it('should parse redirect rule with default status', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/old": {
          "type": "redirect",
          "to": "/new"
        }
      }
    }`);

    const rule = config.getRule(80, '*', '/old');
    expect(rule?.type).toBe(RuleType.REDIRECT);
    if (rule?.type === RuleType.REDIRECT) {
      expect(rule.status).toBe(302);
    }
  });

  it('should parse redirect rule with strip_prefix', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/old": {
          "type": "redirect",
          "to": "https://newsite.com",
          "strip_prefix": "/old",
          "status": 301
        }
      }
    }`);

    const rule = config.getRule(80, '*', '/old');
    expect(rule?.type).toBe(RuleType.REDIRECT);
    if (rule?.type === RuleType.REDIRECT) {
      expect(rule.strip_prefix).toBe('/old');
    }
  });

  it('should parse rewrite rule', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/api": {
          "type": "rewrite",
          "to": "/v1/api"
        }
      }
    }`);

    const rule = config.getRule(80, '*', '/api');
    expect(rule?.type).toBe(RuleType.REWRITE);
    if (rule?.type === RuleType.REWRITE) {
      expect(rule.to).toBe('/v1/api');
    }
  });

  it('should parse proxy rule with multiple targets (load balancing)', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/": {
          "type": "proxy",
          "to": [
            "http://server1:3000",
            "http://server2:3000",
            "http://server3:3000"
          ]
        }
      }
    }`);

    const rule = config.getRule(80, '*', '/');
    expect(rule?.type).toBe(RuleType.PROXY);
    if (rule?.type === RuleType.PROXY) {
      expect(rule.targets).toHaveLength(3);
      expect(rule.targets).toEqual([
        'http://server1:3000',
        'http://server2:3000',
        'http://server3:3000',
      ]);
    }
  });

  it('should parse proxy rule with single target as string', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/": {
          "to": "http://server:3000"
        }
      }
    }`);

    const rule = config.getRule(80, '*', '/');
    expect(rule?.type).toBe(RuleType.PROXY);
    if (rule?.type === RuleType.PROXY) {
      expect(rule.targets).toEqual(['http://server:3000']);
    }
  });

  it('should parse proxy rule without explicit type', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/": {
          "to": "http://server:3000"
        }
      }
    }`);

    const rule = config.getRule(80, '*', '/');
    expect(rule?.type).toBe(RuleType.PROXY);
  });
});

describe('ProxyConfig - Rule Resolution', () => {
  it('should match exact hostname before wildcard', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "hosts": {
          "specific.local": "http://localhost:3000",
          "*": "http://localhost:4000"
        }
      }
    }`);

    const specificRule = config.getRule(80, 'specific.local', '/');
    const wildcardRule = config.getRule(80, 'any-other.local', '/');

    expect(specificRule).toBeDefined();
    expect(wildcardRule).toBeDefined();

    if (specificRule?.type === RuleType.PROXY && wildcardRule?.type === RuleType.PROXY) {
      expect(specificRule.targets).toEqual(['http://localhost:3000']);
      expect(wildcardRule.targets).toEqual(['http://localhost:4000']);
    }
  });

  it('should match exact path before wildcard', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/api": "http://localhost:9000",
        "*": "http://localhost:3000"
      }
    }`);

    const apiRule = config.getRule(80, '*', '/api');
    const otherRule = config.getRule(80, '*', '/other');

    expect(apiRule).toBeDefined();
    expect(otherRule).toBeDefined();

    if (apiRule?.type === RuleType.PROXY && otherRule?.type === RuleType.PROXY) {
      expect(apiRule.targets).toEqual(['http://localhost:9000']);
      expect(otherRule.targets).toEqual(['http://localhost:3000']);
    }
  });

  it('should return undefined for non-existent port', () => {
    const config = ProxyConfig.loadFromString(`{"80": "http://localhost:3000"}`);
    expect(config.getRule(8080, '*', '/')).toBeUndefined();
  });

  it('should return undefined for non-matching hostname and no wildcard', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "hosts": {
          "specific.local": "http://localhost:3000"
        }
      }
    }`);

    expect(config.getRule(80, 'nonexistent.local', '/')).toBeUndefined();
  });

  it('should fallback to wildcard path when exact path not found', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/api": "http://localhost:9000",
        "*": "http://localhost:3000"
      }
    }`);

    const randomPath = config.getRule(80, '*', '/random/path');
    expect(randomPath).toBeDefined();
    if (randomPath?.type === RuleType.PROXY) {
      expect(randomPath.targets).toEqual(['http://localhost:3000']);
    }
  });

  it('should fallback to wildcard hostname when exact hostname not found', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "hosts": {
          "known.local": "http://localhost:3000",
          "*": "http://localhost:4000"
        }
      }
    }`);

    const unknownHost = config.getRule(80, 'unknown.local', '/');
    expect(unknownHost).toBeDefined();
    if (unknownHost?.type === RuleType.PROXY) {
      expect(unknownHost.targets).toEqual(['http://localhost:4000']);
    }
  });
});

describe('ProxyConfig - Defaults Configuration', () => {
  it('should parse __defaults key', () => {
    const config = ProxyConfig.loadFromString(`{
      "__defaults": {
        "timeout_ms": 30000,
        "retries": {
          "attempts": 3,
          "backoff_ms": 1000
        }
      },
      "80": "http://localhost:3000"
    }`);

    const defaults = config.getDefaults();
    expect(defaults).toBeDefined();
    expect(defaults?.timeout_ms).toBe(30000);
    expect(defaults?.retries?.attempts).toBe(3);
    expect(defaults?.retries?.backoff_ms).toBe(1000);
  });

  it('should skip __defaults key when iterating ports', () => {
    const config = ProxyConfig.loadFromString(`{
      "__defaults": { "timeout_ms": 5000 },
      "80": "http://localhost:3000"
    }`);

    expect(config.getPorts()).toHaveLength(1);
    expect(config.getPorts()).toEqual([80]);
  });

  it('should return undefined for getDefaults when not configured', () => {
    const config = ProxyConfig.loadFromString(`{"80": "http://localhost:3000"}`);
    expect(config.getDefaults()).toBeUndefined();
  });
});

describe('ProxyConfig - Backward Compatibility', () => {
  it('should treat path-only config as wildcard hostname', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/api": "http://localhost:9000"
      }
    }`);

    // Should work with any hostname
    expect(config.getRule(80, 'any.hostname', '/api')).toBeDefined();
    expect(config.getRule(80, 'another.host', '/api')).toBeDefined();
  });

  it('should treat simple string as wildcard hostname and path', () => {
    const config = ProxyConfig.loadFromString(`{"80": "http://localhost:3000"}`);

    // Should work with any hostname and any path
    expect(config.getRule(80, 'any.hostname', '/')).toBeDefined();
    expect(config.getRule(80, 'any.hostname', '/any/path')).toBeDefined();
  });

  it('should support mixed config (hosts and non-hosts on different ports)', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "hosts": {
          "api.example.com": "http://api:9000"
        }
      },
      "8080": "http://localhost:3000"
    }`);

    const vhostRule = config.getRule(80, 'api.example.com', '/');
    const simpleRule = config.getRule(8080, 'any.host', '/');

    expect(vhostRule).toBeDefined();
    expect(simpleRule).toBeDefined();
  });
});

describe('ProxyConfig - Edge Cases', () => {
  it('should skip invalid rule types', () => {
    // Test with an invalid rule type to cover the undefined return in normalizeRule
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/test": {
          "type": "invalid-type",
          "to": "http://backend"
        }
      }
    }`);

    // Rule should be undefined since type is invalid
    const rule = config.getRule(80, '*', '/test');
    expect(rule).toBeUndefined();

    consoleWarnSpy.mockRestore();
  });
});

describe('ProxyConfig - Complex Scenarios', () => {
  it('should handle deep nesting (hostname + path + rule type)', () => {
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
              "to": "https://newapi.example.com/v2",
              "status": 308
            }
          }
        }
      }
    }`);

    const v1Rule = config.getRule(80, 'api.example.com', '/v1');
    const v2Rule = config.getRule(80, 'api.example.com', '/v2');

    expect(v1Rule?.type).toBe(RuleType.PROXY);
    expect(v2Rule?.type).toBe(RuleType.REDIRECT);

    if (v1Rule?.type === RuleType.PROXY) {
      expect(v1Rule.targets).toHaveLength(2);
    }

    if (v2Rule?.type === RuleType.REDIRECT) {
      expect(v2Rule.status).toBe(308);
    }
  });

  it('should handle health_check configuration', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": {
        "/api": {
          "type": "proxy",
          "to": ["http://api-1:9000", "http://api-2:9000"],
          "health_check": {
            "path": "/health",
            "interval_ms": 10000
          }
        }
      }
    }`);

    const rule = config.getRule(80, '*', '/api');
    expect(rule?.type).toBe(RuleType.PROXY);

    if (rule?.type === RuleType.PROXY) {
      expect(rule.health_check).toBeDefined();
      expect(rule.health_check?.path).toBe('/health');
      expect(rule.health_check?.interval_ms).toBe(10000);
    }
  });
});

describe('ProxyConfig - Helper Methods', () => {
  it('should return true for hasPort when port exists', () => {
    const config = ProxyConfig.loadFromString(`{"80": "http://localhost:3000"}`);
    expect(config.hasPort(80)).toBe(true);
  });

  it('should return false for hasPort when port does not exist', () => {
    const config = ProxyConfig.loadFromString(`{"80": "http://localhost:3000"}`);
    expect(config.hasPort(8080)).toBe(false);
  });

  it('should return all configured ports', () => {
    const config = ProxyConfig.loadFromString(`{
      "80": "http://localhost:3000",
      "8080": "http://localhost:4000",
      "443": "http://localhost:5000"
    }`);

    const ports = config.getPorts();
    expect(ports).toHaveLength(3);
    expect(ports).toContain(80);
    expect(ports).toContain(8080);
    expect(ports).toContain(443);
  });

  it('should return the underlying map structure', () => {
    const config = ProxyConfig.loadFromString(`{"80": "http://localhost:3000"}`);
    const configMap = config.getMap();
    expect(configMap).toBeInstanceOf(Map);
    expect(configMap.has(80)).toBe(true);
  });

  describe('hasPath() method', () => {
    it('should return true when exact path exists', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": "http://localhost:9000"
        }
      }`);
      expect(config.hasPath(80, '/api')).toBe(true);
    });

    it('should return true for wildcard path when exact path does not exist', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "*": "http://localhost:3000"
        }
      }`);
      expect(config.hasPath(80, '/any')).toBe(true);
    });

    it('should return true for any path when wildcard exists', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": "http://localhost:9000",
          "*": "http://localhost:3000"
        }
      }`);
      expect(config.hasPath(80, '/nonexistent')).toBe(true);
    });

    it('should return false when port does not exist', () => {
      const config = ProxyConfig.loadFromString(`{"80": "http://localhost:3000"}`);
      expect(config.hasPath(9090, '/api')).toBe(false);
    });

    it('should return false when no matching path and no wildcard', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": "http://localhost:9000"
        }
      }`);
      expect(config.hasPath(80, '/other')).toBe(false);
    });
  });

  describe('getPaths() method', () => {
    it('should return all paths for a port', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": {
          "/api": "http://localhost:9000",
          "/web": "http://localhost:3000",
          "*": "http://localhost:4000"
        }
      }`);
      const paths = config.getPaths(80);
      expect(paths).toHaveLength(3);
      expect(paths).toContain('/api');
      expect(paths).toContain('/web');
      expect(paths).toContain('*');
    });

    it('should return empty array when port does not exist', () => {
      const config = ProxyConfig.loadFromString(`{"80": "http://localhost:3000"}`);
      expect(config.getPaths(9090)).toEqual([]);
    });

    it('should return empty array for non-configured port', () => {
      const config = ProxyConfig.loadFromString(`{
        "80": "http://localhost:3000"
      }`);
      expect(config.getPaths(443)).toEqual([]);
    });
  });
});
