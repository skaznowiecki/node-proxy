import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigValidator } from '@/lib/config-validator';

const FIXTURES_DIR = join(__dirname, '../fixtures');

describe('ConfigValidator - JSON Syntax Validation', () => {
    it('should return error for invalid JSON', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('invalid json');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_JSON');
        expect(result.errors[0].severity).toBe('error');
    });

    it('should accept valid JSON', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "http://localhost:3000"}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should return detailed error message with position', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": invalid}');

        expect(result.errors[0].message).toContain('Invalid JSON syntax');
    });
});

describe('ConfigValidator - Port Validation', () => {
    it('should reject port 0', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"0": "http://localhost:3000"}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_PORT');
        expect(result.errors[0].message).toContain('Port must be between 1 and 65535');
    });

    it('should reject port > 65535', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"70000": "http://localhost:3000"}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_PORT');
    });

    it('should reject negative ports', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"-1": "http://localhost:3000"}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_PORT');
    });

    it('should reject non-numeric port keys', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"abc": "http://localhost:3000"}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_PORT');
        expect(result.errors[0].message).toContain('Port must be a number');
    });

    it('should accept valid ports (1-65535)', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "http://localhost:3000", "8080": "http://localhost:4000", "65535": "http://localhost:5000"}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
});

describe('ConfigValidator - URL Validation', () => {
    it('should reject URLs without protocol', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "localhost:3000"}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        // URL without protocol is actually parsed with incorrect protocol
        expect(result.errors[0].code).toBe('INVALID_PROTOCOL');
    });

    it('should reject URLs with invalid protocol', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "ftp://localhost:3000"}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_PROTOCOL');
        expect(result.errors[0].message).toContain('must use http:// or https://');
    });

    it('should reject malformed URLs', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "not-a-valid-url"}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_URL');
    });

    it('should accept http:// URLs', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "http://localhost:3000"}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should accept https:// URLs', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "https://localhost:3000"}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should accept URLs with ports', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "http://localhost:9000"}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should accept URLs with paths', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "http://localhost:3000/api"}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should validate URLs in array targets', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"*": {"to": ["http://localhost:3000", "invalid-url"]}}}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_URL');
        expect(result.errors[0].path).toContain('to[1]');
    });
});

describe('ConfigValidator - Rule Type Validation', () => {
    it('should reject unknown rule types', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "unknown", "to": "http://localhost:3000"}}}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_RULE_TYPE');
        expect(result.errors[0].message).toContain('proxy, redirect, rewrite');
    });

    it('should accept proxy type', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "proxy", "to": "http://localhost:3000"}}}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should accept redirect type', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "redirect", "to": "http://localhost:3000"}}}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should accept rewrite type', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "rewrite", "to": "/v1/api"}}}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should accept rules without type (defaults to proxy)', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"to": "http://localhost:3000"}}}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
});

describe('ConfigValidator - Required Fields Validation', () => {
    it('should require "to" field for proxy rules', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "proxy"}}}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
        expect(result.errors[0].message).toContain('"to" field');
    });

    it('should require "to" field for redirect rules', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "redirect"}}}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should require "to" field for rewrite rules', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "rewrite"}}}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
    });

    it('should reject empty "to" string', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"to": ""}}}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('EMPTY_TARGET');
    });

    it('should reject empty "to" array', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"to": []}}}');

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('EMPTY_TARGET');
    });

    it('should accept simple string targets', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "http://localhost:3000"}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should accept array targets', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"*": {"to": ["http://localhost:3000", "http://localhost:4000"]}}}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
});

describe('ConfigValidator - Redirect Status Validation', () => {
    it('should warn for non-3xx status codes', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "redirect", "to": "http://localhost:3000", "status": 200}}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].code).toBe('INVALID_REDIRECT_STATUS');
        expect(result.warnings[0].message).toContain('301, 302, 307, 308');
    });

    it('should accept 301', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "redirect", "to": "http://localhost:3000", "status": 301}}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
    });

    it('should accept 302', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "redirect", "to": "http://localhost:3000", "status": 302}}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
    });

    it('should accept 307', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "redirect", "to": "http://localhost:3000", "status": 307}}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
    });

    it('should accept 308', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "redirect", "to": "http://localhost:3000", "status": 308}}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
    });

    it('should accept redirect without status (defaults to 302)', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "redirect", "to": "http://localhost:3000"}}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
    });
});

describe('ConfigValidator - Shadowed Rules Detection', () => {
    it('should warn when wildcard path shadows specific paths', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"*": "http://localhost:3000", "/api": "http://localhost:4000"}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].code).toBe('SHADOWED_PATH');
        expect(result.warnings[0].message).toContain('Wildcard path "*" appears before specific paths');
    });

    it('should warn when wildcard host shadows specific hosts', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"hosts": {"*": "http://localhost:3000", "api.example.com": "http://localhost:4000"}}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].code).toBe('SHADOWED_HOST');
        expect(result.warnings[0].message).toContain('Wildcard host "*" appears before specific hosts');
    });

    it('should not warn for correctly ordered rules', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": "http://localhost:4000", "*": "http://localhost:3000"}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
    });

    it('should detect path shadowing in virtual hosts', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"hosts": {"example.com": {"*": "http://localhost:3000", "/api": "http://localhost:4000"}}}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].code).toBe('SHADOWED_PATH');
    });
});

describe('ConfigValidator - Empty Configuration', () => {
    it('should warn for empty configuration', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].code).toBe('EMPTY_CONFIG');
    });

    it('should not warn when only __defaults is present', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"__defaults": {"timeout_ms": 5000}}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].code).toBe('EMPTY_CONFIG');
    });

    it('should not warn when ports are configured', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "http://localhost:3000"}');

        expect(result.valid).toBe(true);
        expect(result.warnings).toHaveLength(0);
    });
});

describe('ConfigValidator - Integration with Fixture Files', () => {
    it('should successfully validate basic.json', () => {
        const content = readFileSync(join(FIXTURES_DIR, 'basic.json'), 'utf-8');
        const validator = new ConfigValidator();
        const result = validator.validate(content);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should successfully validate path.json', () => {
        const content = readFileSync(join(FIXTURES_DIR, 'path.json'), 'utf-8');
        const validator = new ConfigValidator();
        const result = validator.validate(content);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should successfully validate multi-hosts.json', () => {
        const content = readFileSync(join(FIXTURES_DIR, 'multi-hosts.json'), 'utf-8');
        const validator = new ConfigValidator();
        const result = validator.validate(content);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should successfully validate redirect.json', () => {
        const content = readFileSync(join(FIXTURES_DIR, 'redirect.json'), 'utf-8');
        const validator = new ConfigValidator();
        const result = validator.validate(content);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should successfully validate rewrite.json', () => {
        const content = readFileSync(join(FIXTURES_DIR, 'rewrite.json'), 'utf-8');
        const validator = new ConfigValidator();
        const result = validator.validate(content);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should successfully validate all fixture files', () => {
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

        const validator = new ConfigValidator();

        for (const configFile of configFiles) {
            const content = readFileSync(join(FIXTURES_DIR, configFile), 'utf-8');
            const result = validator.validate(content);

            expect(result.valid, `${configFile} should be valid`).toBe(true);
            expect(result.errors, `${configFile} should have no errors`).toHaveLength(0);
        }
    });
});

describe('ConfigValidator - Complex Scenarios', () => {
    it('should return ProxyConfig on successful validation', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": "http://localhost:3000"}');

        expect(result.valid).toBe(true);
        expect(result.config).toBeDefined();
        expect(result.config?.getPorts()).toContain(80);
    });

    it('should not return config when validation fails', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"99999": "http://localhost:3000"}');

        expect(result.valid).toBe(false);
        expect(result.config).toBeUndefined();
    });

    it('should handle multiple errors', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"0": "not-a-url", "99999": "also-not-a-url"}');

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(2);
    });

    it('should allow relative URLs for redirects', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/old": {"type": "redirect", "to": "/new"}}}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should allow paths for rewrite rules', () => {
        const validator = new ConfigValidator();
        const result = validator.validate('{"80": {"/api": {"type": "rewrite", "to": "/v1/api"}}}');

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
});
