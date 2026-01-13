import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ProxyConfig } from '@/lib/proxy-config';
import { ConfigPreviewer } from '@/lib/config-previewer';

const FIXTURES_DIR = join(__dirname, '../fixtures');

describe('ConfigPreviewer - Basic Rendering', () => {
    it('should render simple port -> URL config', () => {
        const config = ProxyConfig.loadFromString('{"80": "http://localhost:3000"}');
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('Configuration Preview');
        expect(output).toContain('Port 80');
        expect(output).toContain('Host: * (all hosts)');
        expect(output).toContain('Path: *');
        expect(output).toContain('[PROXY] -> http://localhost:3000');
        expect(output).toContain('Summary:');
    });

    it('should render path-based routing', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "/api": "http://localhost:9000",
                "/web": "http://localhost:3000"
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('Path: /api');
        expect(output).toContain('Path: /web');
        expect(output).toContain('http://localhost:9000');
        expect(output).toContain('http://localhost:3000');
    });

    it('should render virtual host configuration', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "hosts": {
                    "myshop.local": "http://localhost:3000",
                    "myblog.local": "http://localhost:4000"
                }
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('Host: myshop.local');
        expect(output).toContain('Host: myblog.local');
        expect(output).toContain('http://localhost:3000');
        expect(output).toContain('http://localhost:4000');
    });
});

describe('ConfigPreviewer - Rule Type Rendering', () => {
    it('should render PROXY rules with targets', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "/api": {
                    "type": "proxy",
                    "to": "http://localhost:9000"
                }
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('[PROXY]');
        expect(output).toContain('http://localhost:9000');
    });

    it('should render REDIRECT rules with status', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "/old": {
                    "type": "redirect",
                    "to": "http://newsite.com",
                    "status": 301
                }
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('[REDIRECT 301]');
        expect(output).toContain('http://newsite.com');
    });

    it('should render REWRITE rules with destination', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "/api": {
                    "type": "rewrite",
                    "to": "/v1/api"
                }
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('[REWRITE]');
        expect(output).toContain('/v1/api');
    });

    it('should show load balancing info for multiple targets', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "/api": {
                    "to": ["http://api-1:9000", "http://api-2:9000", "http://api-3:9000"]
                }
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('http://api-1:9000, http://api-2:9000, http://api-3:9000');
        expect(output).toContain('(load balanced, 3 targets)');
    });

    it('should show strip_prefix for redirect rules', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "/old": {
                    "type": "redirect",
                    "to": "http://newsite.com",
                    "strip_prefix": "/old",
                    "status": 301
                }
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('(strip_prefix: /old)');
    });
});

describe('ConfigPreviewer - Tree Structure', () => {
    it('should use correct tree characters', () => {
        const config = ProxyConfig.loadFromString('{"80": "http://localhost:3000"}');
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('+--');
        // Tree uses indentation for structure
        expect(output).toContain('Host:');
        expect(output).toContain('Path:');
    });

    it('should render multiple ports with proper separation', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": "http://localhost:3000",
            "8080": "http://localhost:4000"
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('Port 80');
        expect(output).toContain('Port 8080');

        const lines = output.split('\n');
        const port80Index = lines.findIndex((l) => l.includes('Port 80'));
        const port8080Index = lines.findIndex((l) => l.includes('Port 8080'));

        expect(port8080Index).toBeGreaterThan(port80Index);
    });
});

describe('ConfigPreviewer - Summary', () => {
    it('should show port count', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": "http://localhost:3000",
            "8080": "http://localhost:4000",
            "443": "http://localhost:5000"
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('Summary: 3 ports');
    });

    it('should show host count', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "hosts": {
                    "shop.local": "http://localhost:3000",
                    "blog.local": "http://localhost:4000"
                }
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('2 hosts');
    });

    it('should show rule count', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "/api": "http://localhost:9000",
                "/web": "http://localhost:3000",
                "*": "http://localhost:4000"
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('3 rules');
    });

    it('should use singular form for single items', () => {
        const config = ProxyConfig.loadFromString('{"80": "http://localhost:3000"}');
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('1 port');
        expect(output).toContain('1 host');
        expect(output).toContain('1 rule');
        expect(output).not.toContain('1 ports');
        expect(output).not.toContain('1 hosts');
        expect(output).not.toContain('1 rules');
    });
});

describe('ConfigPreviewer - Options', () => {
    it('should render without colors when colorize is false', () => {
        const config = ProxyConfig.loadFromString('{"80": "http://localhost:3000"}');
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        // Check that ANSI color codes are not present
        expect(output).not.toContain('\x1b[');
    });

    it('should render with colors when colorize is true', () => {
        const config = ProxyConfig.loadFromString('{"80": "http://localhost:3000"}');
        const previewer = new ConfigPreviewer({ colorize: true });
        const output = previewer.preview(config);

        // Check that ANSI color codes are present
        expect(output).toContain('\x1b[');
    });

    it('should render compact view when compact is true', () => {
        const config = ProxyConfig.loadFromString(`{
            "80": {
                "/api": {
                    "to": ["http://api-1:9000", "http://api-2:9000"]
                }
            }
        }`);
        const previewer = new ConfigPreviewer({ colorize: false, compact: true });
        const output = previewer.preview(config);

        // Compact view should not show load balancing details
        expect(output).not.toContain('(load balanced');
    });
});

describe('ConfigPreviewer - Fixture Files Integration', () => {
    it('should render basic.json without errors', () => {
        const content = readFileSync(join(FIXTURES_DIR, 'basic.json'), 'utf-8');
        const config = ProxyConfig.loadFromString(content);
        const previewer = new ConfigPreviewer({ colorize: false });

        expect(() => previewer.preview(config)).not.toThrow();
    });

    it('should render vhost-mixed.json with all rule types', () => {
        const content = readFileSync(join(FIXTURES_DIR, 'vhost-mixed.json'), 'utf-8');
        const config = ProxyConfig.loadFromString(content);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('[PROXY]');
        expect(output).toContain('[REDIRECT');
        expect(output).toContain('[REWRITE]');
    });

    it('should render multi-hosts.json with load balancing', () => {
        const content = readFileSync(join(FIXTURES_DIR, 'multi-hosts.json'), 'utf-8');
        const config = ProxyConfig.loadFromString(content);
        const previewer = new ConfigPreviewer({ colorize: false });
        const output = previewer.preview(config);

        expect(output).toContain('(load balanced');
    });

    it('should render all fixture files without errors', () => {
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

        const previewer = new ConfigPreviewer({ colorize: false });

        for (const configFile of configFiles) {
            const content = readFileSync(join(FIXTURES_DIR, configFile), 'utf-8');
            const config = ProxyConfig.loadFromString(content);

            expect(() => previewer.preview(config), `${configFile} should render without errors`).not.toThrow();

            const output = previewer.preview(config);
            expect(output, `${configFile} should have title`).toContain('Configuration Preview');
            expect(output, `${configFile} should have summary`).toContain('Summary:');
        }
    });
});
