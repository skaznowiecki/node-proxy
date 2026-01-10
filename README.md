# node-proxy

[![npm version](https://img.shields.io/npm/v/node-proxy.svg)](https://www.npmjs.com/package/node-proxy)
[![CI](https://github.com/skaznowiecki/node-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/skaznowiecki/node-proxy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/node-proxy.svg)](https://nodejs.org)

> A lightweight, zero-dependency, configuration-driven HTTP/HTTPS proxy server with TLS termination, load balancing, and virtual hosts

## ✨ Features

- 🌐 **Virtual Host Routing** - Route requests by hostname
- 🛣️ **Path-Based Routing** - Different URL paths to different backends
- ⚖️ **Load Balancing** - Round-robin distribution across multiple backends
- 🔀 **Redirects & Rewrites** - HTTP redirects and URL path rewriting
- 👥 **Cluster Mode** - Multi-process scaling for performance
- 🔄 **Daemon Management** - Run as background service (start/stop/restart/status)
- 📊 **Health Checks** - Monitor backend health (coming soon)
- ✅ **TypeScript** - Fully typed for great developer experience

---

## 📦 Installation

```bash
# Global installation (recommended for CLI usage)
npm install -g node-proxy

# Or local installation
npm install node-proxy
```

## 🚀 Quickstart

### 1. Install (Development)
```bash
git clone https://github.com/skaznowiecki/node-proxy.git
cd node-proxy
npm install
npm run build
```

### 2. Create Configuration
Create `config.json`:
```json
{
  "80": {
    "hosts": {
      "myapp.local": "http://localhost:3000"
    }
  }
}
```

### 3. Start Proxy
```bash
# If installed globally
node-proxy start --rules config.json

# Or if installed locally
npx node-proxy start --rules config.json

# Or for development
npm run daemon:start -- --rules config.json
```

### 4. Test It
Add to `/etc/hosts`:
```
127.0.0.1  myapp.local
```

Visit: http://myapp.local/

---

## 📚 Progressive Learning Path

Learn by example, starting simple and building complexity.

### Level 1: Simple Routing
**Use Case**: Forward all traffic on a port to a single backend

```json
{
  "80": "http://localhost:3000"
}
```

Routes **all requests** on port 80 to `http://localhost:3000`.

---

### Level 2: Path-Based Routing
**Use Case**: Route different URL paths to different backends

```json
{
  "80": {
    "/api": "http://localhost:9000",
    "/static": "http://localhost:8080",
    "*": "http://localhost:3000"
  }
}
```

- `/api/*` → API server (port 9000)
- `/static/*` → Static file server (port 8080)
- Everything else (`*`) → Main app (port 3000)

---

### Level 3: Virtual Hosts
**Use Case**: Multiple domains on same port, different backends

```json
{
  "80": {
    "hosts": {
      "shop.example.com": "http://shop-backend:3000",
      "blog.example.com": "http://blog-backend:4000",
      "admin.example.com": "http://admin-backend:5000"
    }
  }
}
```

Routes by **hostname**:
- `shop.example.com` → Shop backend
- `blog.example.com` → Blog backend
- `admin.example.com` → Admin backend

---

### Level 4: Load Balancing
**Use Case**: Distribute traffic across multiple backends

```json
{
  "80": {
    "hosts": {
      "api.example.com": {
        "type": "proxy",
        "to": [
          "http://api-server-1:9000",
          "http://api-server-2:9000",
          "http://api-server-3:9000"
        ]
      }
    }
  }
}
```

Requests are distributed **round-robin** across 3 API servers for high availability.

---

### Level 5: Advanced Routing
**Use Case**: Mix of proxying, redirects, and rewrites

```json
{
  "80": {
    "hosts": {
      "www.example.com": {
        "/": "http://frontend:3000",
        "/api": {
          "type": "proxy",
          "to": ["http://api-1:9000", "http://api-2:9000"]
        },
        "/static": {
          "type": "redirect",
          "to": "https://cdn.example.com/static",
          "strip_prefix": "/static",
          "status": 301
        },
        "/old-api": {
          "type": "rewrite",
          "to": "/api/v2"
        }
      }
    }
  }
}
```

Combines multiple routing strategies:
- **Proxy**: Root to frontend, API with load balancing
- **Redirect**: Static assets to CDN (301 permanent redirect)
- **Rewrite**: Old API path transformed to new versioned path

---

## ⚙️ Configuration Reference

### Rule Types

#### 1. Proxy (Default)
Forward requests to backend server(s).

**Single backend:**
```json
{
  "/api": "http://backend:9000"
}
```

**Multiple backends (load balancing):**
```json
{
  "/api": {
    "type": "proxy",
    "to": [
      "http://backend-1:9000",
      "http://backend-2:9000"
    ]
  }
}
```

**With health checks (coming soon):**
```json
{
  "/api": {
    "type": "proxy",
    "to": ["http://backend-1:9000", "http://backend-2:9000"],
    "health_check": {
      "path": "/health",
      "interval_ms": 5000,
      "timeout_ms": 800,
      "expect_status": [200, 204]
    }
  }
}
```

#### 2. Redirect
HTTP redirect responses (301/302).

```json
{
  "/old-path": {
    "type": "redirect",
    "to": "/new-path",
    "status": 301
  }
}
```

**With path stripping:**
```json
{
  "/static": {
    "type": "redirect",
    "to": "https://cdn.example.com",
    "strip_prefix": "/static",
    "status": 302
  }
}
```

Redirects `/static/image.png` → `https://cdn.example.com/image.png`

#### 3. Rewrite
Rewrite the URL path before proxying.

```json
{
  "/api": {
    "type": "rewrite",
    "to": "/api/v2"
  }
}
```

Request to `/api/users` → Proxied as `/api/v2/users`

### Global Defaults

Use `__defaults` for global settings:

```json
{
  "__defaults": {
    "timeout_ms": 30000,
    "retry": {
      "attempts": 3,
      "backoff_ms": 1000
    },
    "headers": {
      "x_forwarded": true,
      "pass_host": true
    }
  },
  "80": "http://backend:3000"
}
```

### Wildcard Matching

- **Path wildcard**: `"*"` matches any path not explicitly defined
- **Host wildcard**: `"*"` matches any hostname not explicitly defined

**Example:**
```json
{
  "80": {
    "hosts": {
      "api.example.com": "http://api:9000",
      "*": "http://default-backend:3000"
    }
  }
}
```

---

## 🖥️ CLI Usage

### Daemon Mode

**Start:**
```bash
npm run daemon:start -- --rules config.json
npm run daemon:start -- --rules config.json --cluster --workers 4
```

**Stop:**
```bash
npm run daemon:stop
```

**Restart:**
```bash
npm run daemon:restart -- --rules new-config.json
```

**Status:**
```bash
npm run daemon:status
```

### Cluster Mode

Run with multiple worker processes for better performance:

```bash
npm run daemon:start -- --rules config.json --cluster --workers 4
```

- Automatically restarts failed workers
- Distributes load across CPU cores
- Master process manages worker lifecycle

---

## 💡 Advanced Examples

All examples are in `src/__tests__/fixtures/`:

### Feature Examples
- **basic.json** - Simplest proxy setup
- **path.json** - Path-based routing
- **multi-hosts.json** - Load balancing
- **redirect.json** - HTTP redirects
- **rewrite.json** - URL rewriting
- **defaults.json** - Global defaults
- **health-check.json** - Health checks (future)

### Progressive Examples
- **vhost-simple.json** - Basic virtual hosts (Level 1)
- **vhost-paths.json** - Virtual hosts + path routing (Level 2)
- **vhost-loadbalancing.json** - Virtual hosts + load balancing (Level 3)
- **vhost-mixed.json** - Mixed routing types (Level 4)
- **vhost-production.json** - Production setup with SSL syntax (Level 5)

### Real-World Patterns
- **vhost-microservices.json** - API gateway for microservices
- **vhost-development.json** - Local development environment

View the complete files in `src/__tests__/fixtures/` for detailed examples.

---

## 🛠️ Development

### Running Tests

```bash
npm test                 # Run in watch mode
npm run test:run         # Run once
npm run test:coverage    # With coverage report
npm run test:ui          # Visual test UI
```

**Coverage:** 92%+ on ProxyConfig class

### Project Structure

```
src/
├── app.ts                      # Main entry point (daemon CLI)
├── lib/
│   ├── proxy-config.ts        # Configuration parser
│   └── proxy-server.ts        # HTTP server & routing
├── types/
│   ├── raw-proxy-config.ts    # Input JSON types
│   ├── standardized-proxy-config.ts  # Internal types
│   └── shared-proxy-config.ts # Shared types
├── helpers/
│   ├── daemon.ts              # Daemon lifecycle
│   ├── logger.ts              # Logging
│   └── parse-arguments.ts     # CLI args
└── __tests__/
    ├── lib/                   # Unit & integration tests
    └── fixtures/              # Example configs (14 files)
```

### Type System

**Configuration Flow:**
1. **Raw JSON** → `RawProxyConfig` (flexible input)
2. **Parser** → `ProxyConfig` class (normalization)
3. **Internal** → `ProxyConfigMap` (optimized lookup)
4. **Rules** → `ProxyRule` union type (standardized)

### Architecture

```
Request → ProxyServer → ProxyConfig.getRule()
                              ↓
                         Route Lookup
                    (port → host → path)
                              ↓
                      ProxyRule (matched)
                              ↓
                    ┌─────────┴─────────┐
                 PROXY            REDIRECT         REWRITE
                    │                │                │
            Round-robin         HTTP 301/302     Path transform
            to backend(s)       response         then PROXY
```

**Key Features:**
- **O(1) lookups** - Uses nested Maps for fast routing
- **Exact before wildcard** - Hostname/path matching priority
- **Round-robin** - Load balancing per route (port:host:path key)
- **Type-safe** - Full TypeScript coverage

### How It Works

1. **Configuration Loading**: JSON file parsed into `RawProxyConfig`, then normalized to `ProxyConfigMap`
2. **Server Startup**: Creates HTTP servers for each configured port
3. **Request Handling**:
   - Extract port, hostname, and path from request
   - Lookup rule using `getRule(port, hostname, path)`
   - Execute rule (proxy, redirect, or rewrite)
4. **Load Balancing**: Round-robin counter per unique `port:host:path` key
5. **Cluster Mode**: Master process spawns workers, manages lifecycle

---

## 📄 License

ISC License

## 🙏 Credits

Built with TypeScript, Node.js, and ❤️
