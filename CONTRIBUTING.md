# Contributing to node-proxy

Thank you for considering contributing to node-proxy! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the problem
- **Expected behavior** vs. **actual behavior**
- **Environment details** (Node.js version, OS, etc.)
- **Configuration file** (if applicable)
- **Error messages and logs**

### Suggesting Features

Feature suggestions are welcome! Please:

- **Check existing feature requests** first
- **Provide a clear use case** for the feature
- **Explain why this would be useful** to most users
- **Consider implementation complexity** and maintenance burden

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** following the code style guidelines
4. **Add tests** if you're adding functionality
5. **Ensure tests pass**: `npm run test:run`
6. **Lint your code**: `npm run lint`
7. **Type-check**: `npm run type-check`
8. **Update documentation** if needed
9. **Write a clear commit message**

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/node-proxy.git
cd node-proxy

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test                    # Watch mode
npm run test:run            # Single run
npm run test:coverage       # With coverage

# Lint and format
npm run lint                # Check for issues
npm run format              # Format code
npm run type-check          # TypeScript checking

# Build
npm run build               # Compile TypeScript
```

## Code Style Guidelines

### TypeScript

- Use **strict mode** TypeScript
- Provide **explicit types** for function parameters and return values
- Avoid `any` type unless absolutely necessary
- Use **interfaces** for object shapes
- Use **type aliases** for complex types

### Code Formatting

- Use **Prettier** for formatting (config in `.prettierrc.json`)
- Use **ESLint** for code quality (config in `eslint.config.js`)
- Run `npm run format` before committing

### Naming Conventions

- **camelCase** for variables and functions
- **PascalCase** for classes and interfaces
- **UPPER_CASE** for constants
- **Descriptive names** that explain purpose

### Testing

- Write tests for **all new functionality**
- Aim for **90%+ code coverage**
- Use **descriptive test names**: `it('should return 404 when route not found')`
- Group related tests using `describe()`
- Test both **happy paths** and **error cases**

### Comments

- Use **JSDoc comments** for public APIs
- Explain **why**, not what (code should be self-explanatory)
- Keep comments **up to date** with code changes

## Commit Message Guidelines

Follow conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(proxy): add WebSocket support

Implements WebSocket proxying with proper upgrade handling.

Closes #42
```

```
fix(daemon): handle EADDRINUSE gracefully

Previously, the daemon would crash if the port was already in use.
Now it returns a clear error message.
```

## Architecture Guidelines

### Zero Dependencies Philosophy

This project maintains **zero runtime dependencies** for security and simplicity. Before adding a dependency:

1. **Consider if it's truly necessary**
2. **Check if Node.js built-ins can solve the problem**
3. **Evaluate the maintenance burden**
4. **Discuss with maintainers** first

Only `devDependencies` (testing, linting, building) are acceptable.

### Configuration-Driven Design

The proxy is **configuration-driven**. When adding features:

- **Define configuration types** in `src/types/`
- **Parse in ProxyConfig** (`src/lib/proxy-config.ts`)
- **Use in ProxyServer** (`src/lib/proxy-server.ts`)
- **Add example config** in `src/__tests__/fixtures/`
- **Document in README**

### Testing Philosophy

- **Unit tests** for individual functions/classes
- **Integration tests** for end-to-end scenarios
- **Fixtures** for configuration examples
- **Mock servers** for backend simulation
- **Coverage** should be meaningful, not just a number

## Project Structure

```
src/
├── app.ts                  # CLI entry point
├── lib/
│   ├── proxy-config.ts     # Configuration parser
│   └── proxy-server.ts     # HTTP server & routing
├── types/
│   ├── raw-proxy-config.ts # JSON config types
│   └── standardized-proxy-config.ts # Normalized types
├── helpers/
│   ├── daemon.ts           # Daemon management
│   ├── logger.ts           # Logging system
│   └── parse-arguments.ts  # CLI argument parsing
└── __tests__/
    ├── lib/                # Tests for core logic
    ├── helpers/            # Tests for helpers
    ├── fixtures/           # Example configurations
    └── utils/              # Test utilities
```

## Documentation

When adding features, update:

- **README.md** - User-facing documentation
- **CHANGELOG.md** - Version history
- **TypeScript doc comments** - API documentation
- **Example configs** - Demonstrate usage

## Need Help?

- **Open an issue** for questions or discussions
- **Check existing issues** for similar problems
- **Be patient** - maintainers are volunteers

## Recognition

Contributors will be recognized in the project. All contributions, no matter how small, are appreciated!

---

Thank you for contributing to node-proxy! 🚀
