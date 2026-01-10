# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-10

### Added
- HTTP/HTTPS proxy with TLS termination
- Round-robin load balancing across multiple backend servers
- Virtual host routing based on Host header
- Path-based routing with exact match and wildcard fallback
- HTTP redirects supporting 301, 302, 307, 308 status codes
- URL rewriting with configurable path manipulation
- X-Forwarded headers (X-Forwarded-For, X-Forwarded-Host, X-Forwarded-Proto)
- Connection keep-alive for improved performance
- Cluster mode with automatic worker restart on crashes
- Daemon management with start/stop/restart/status commands
- Comprehensive logging system with configurable levels (DEBUG, INFO, WARN, ERROR)
- Production deployment guides for Let's Encrypt SSL certificates
- Zero runtime dependencies for minimal security surface
- TypeScript declarations for programmatic usage
- Comprehensive test suite with 92%+ code coverage
