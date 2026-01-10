# Development Guide

This guide is for developers who want to contribute to the project or run it locally from source.

## Getting Started

### Prerequisites
- Node.js 18.x or higher
- npm

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/skaznowiecki/node-proxy.git
cd node-proxy

# Install dependencies
npm install

# Run in development mode (with auto-restart)
npm run dev
```

## Development Workflow

### Running Tests

```bash
npm test                 # Run in watch mode
npm run test:run         # Run once
npm run test:coverage    # With coverage report
npm run test:ui          # Visual test UI
```

**Coverage:** 92%+ on core functionality

### Code Quality

```bash
npm run lint             # Run ESLint
npm run type-check       # TypeScript type checking
npm run format           # Format code with Prettier
```

### Building

```bash
npm run build            # Compile TypeScript to dist/
```

### Running Locally

```bash
# Run with tsx (development)
npm run daemon:start     # Start daemon
npm run daemon:stop      # Stop daemon
npm run daemon:restart   # Restart daemon
npm run daemon:status    # Check status

# Run compiled version
node dist/app.js run --rules rules.json
```

## Project Structure

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

## Architecture

### Type System

**Configuration Flow:**
1. **Raw JSON** → `RawProxyConfig` (flexible input)
2. **Parser** → `ProxyConfig` class (normalization)
3. **Internal** → `ProxyConfigMap` (optimized lookup)
4. **Rules** → `ProxyRule` union type (standardized)

### Request Flow

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

**Key Design Features:**
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

## Contributing

Contributions are welcome! Please follow these guidelines:

### Contribution Workflow

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes with tests**
   - Add tests for new functionality
   - Update existing tests if needed
   - Maintain or improve code coverage
4. **Run quality checks**
   ```bash
   npm run lint && npm run type-check && npm run test:run
   ```
5. **Commit your changes**
   ```bash
   git commit -m "feat: add your feature"
   ```
6. **Push and create a pull request**

### Pull Request Requirements

All PRs must meet these criteria:
- ✅ **Passing tests** on Node.js 18.x, 20.x, and 22.x
- ✅ **Code coverage maintained** - No decrease in coverage percentage
- ✅ **ESLint checks passing** - No new linting errors
- ✅ **TypeScript checks passing** - No type errors
- ✅ **Build succeeds** - Code compiles without errors

### Commit Message Convention

We follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `test:` - Test updates
- `refactor:` - Code refactoring

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Use Prettier for formatting
- Write meaningful variable names
- Add JSDoc comments for public APIs

## CI/CD Pipeline

This project uses GitHub Actions for automated testing and publishing:

### Continuous Integration

Runs on every push and pull request:
- Tests on Node.js 18.x, 20.x, 22.x
- ESLint and TypeScript type checking
- Code coverage reporting with Codecov
- Build verification

Check the [CI status](https://github.com/skaznowiecki/node-proxy/actions) to see the latest build results.

### Automated Publishing

Publishes to NPM on GitHub releases:
- Runs full test suite before publishing
- Includes NPM provenance for supply chain security
- Automatic version management via git tags

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md` with release notes
3. Commit changes: `git commit -m "chore: release v1.x.x"`
4. Create git tag: `git tag v1.x.x`
5. Push: `git push origin main --tags`
6. Create GitHub release - this triggers automatic NPM publish

## Additional Resources

- [CONTRIBUTING.md](CONTRIBUTING.md) - Detailed contribution guidelines
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Community guidelines
- [CHANGELOG.md](CHANGELOG.md) - Version history
- [GitHub Issues](https://github.com/skaznowiecki/node-proxy/issues) - Bug reports and feature requests

## Getting Help

- **Questions?** Open a [GitHub Discussion](https://github.com/skaznowiecki/node-proxy/discussions)
- **Bug Reports** Open a [GitHub Issue](https://github.com/skaznowiecki/node-proxy/issues)
- **Feature Requests** Open a [GitHub Issue](https://github.com/skaznowiecki/node-proxy/issues) with the `enhancement` label

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
