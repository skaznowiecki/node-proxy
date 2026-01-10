# Testing TLS/HTTPS Locally

This guide shows you how to test HTTPS/TLS functionality locally using self-signed certificates.

---

## Quick Start (5 minutes)

### 1. Generate Self-Signed Certificate

```bash
# Navigate to your project directory
cd /Users/sergiokaznowiecki/proxy/nodejs

# Generate certificate and key (valid for 365 days)
openssl req -x509 -newkey rsa:4096 \
  -keyout localhost.key \
  -out localhost.crt \
  -days 365 \
  -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Verify the certificate was created
ls -la localhost.*
```

This creates:
- `localhost.crt` - The certificate file
- `localhost.key` - The private key file

### 2. Create a Test Backend Server

Create a simple HTTP backend to proxy to:

```bash
# Start a simple HTTP server on port 3000
npx http-server -p 3000
```

Or create a custom Node.js backend:

```javascript
// test-backend.js
const http = require('http');

const server = http.createServer((req, res) => {
  console.log(`[Backend] ${req.method} ${req.url}`);
  console.log('[Backend] Headers:', JSON.stringify(req.headers, null, 2));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Hello from backend!',
    url: req.url,
    method: req.method,
    headers: req.headers,
  }, null, 2));
});

server.listen(3000, () => {
  console.log('Backend listening on http://localhost:3000');
});
```

```bash
# Run the backend
node test-backend.js
```

### 3. Create Proxy Configuration

Create a test configuration file:

```bash
cat > tls-test.json <<'EOF'
{
  "__defaults": {
    "headers": {
      "x_forwarded": true,
      "pass_host": false
    }
  },
  "8080": {
    "/": {
      "type": "redirect",
      "to": "https://localhost:8443",
      "status": 301
    }
  },
  "8443": {
    "tls": {
      "cert": "./localhost.crt",
      "key": "./localhost.key"
    },
    "*": "http://localhost:3000"
  }
}
EOF
```

### 4. Run the Proxy

```bash
# Build the project first
npm run build

# Run the proxy with the TLS test config
node dist/app.js run --rules tls-test.json
```

You should see:
```
[ProxyServer] HTTP proxy server listening on port 8080
[ProxyServer] HTTPS proxy server listening on port 8443
```

### 5. Test with curl

```bash
# Test HTTP redirect (port 8080 -> 8443)
curl -v http://localhost:8080/test

# Test HTTPS directly (ignore self-signed cert warning)
curl -k https://localhost:8443/test

# Test HTTPS with verbose output to see headers
curl -kv https://localhost:8443/api/users

# Test and see X-Forwarded headers sent to backend
curl -k https://localhost:8443/test 2>&1 | grep -i x-forwarded
```

### 6. Test with Browser

Open your browser and navigate to:
```
https://localhost:8443
```

**Note:** Your browser will show a security warning because the certificate is self-signed. This is expected for local testing.

- **Chrome/Edge:** Click "Advanced" → "Proceed to localhost (unsafe)"
- **Firefox:** Click "Advanced" → "Accept the Risk and Continue"
- **Safari:** Click "Show Details" → "visit this website"

---

## Advanced Testing Scenarios

### Test 1: HTTP to HTTPS Redirect

```bash
# Request to HTTP port should redirect to HTTPS
curl -v http://localhost:8080/

# Look for:
# < HTTP/1.1 301 Moved Permanently
# < Location: https://localhost:8443/
```

### Test 2: Verify X-Forwarded Headers

With the backend running (test-backend.js from above):

```bash
# Make HTTPS request
curl -k https://localhost:8443/test

# Backend console should show:
# "x-forwarded-for": "::1" (or "::ffff:127.0.0.1")
# "x-forwarded-host": "localhost:8443"
# "x-forwarded-proto": "https"
```

### Test 3: TLS with Virtual Hosts

Create a config with virtual host routing:

```json
{
  "__defaults": {
    "headers": {
      "x_forwarded": true
    }
  },
  "8443": {
    "tls": {
      "cert": "./localhost.crt",
      "key": "./localhost.key"
    },
    "hosts": {
      "api.localhost": {
        "/v1": "http://localhost:3001",
        "/v2": "http://localhost:3002"
      },
      "web.localhost": {
        "/": "http://localhost:3000"
      }
    }
  }
}
```

Test with Host header:

```bash
# Test api.localhost virtual host
curl -k -H "Host: api.localhost" https://localhost:8443/v1

# Test web.localhost virtual host
curl -k -H "Host: web.localhost" https://localhost:8443/
```

### Test 4: TLS with Load Balancing

Start multiple backends:

```bash
# Terminal 1
npx http-server -p 3001

# Terminal 2
npx http-server -p 3002

# Terminal 3
npx http-server -p 3003
```

Create config with load balancing:

```json
{
  "8443": {
    "tls": {
      "cert": "./localhost.crt",
      "key": "./localhost.key"
    },
    "/api": {
      "type": "proxy",
      "to": [
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003"
      ]
    }
  }
}
```

Test round-robin:

```bash
# Make multiple requests - should cycle through backends
for i in {1..6}; do
  echo "Request $i:"
  curl -ks https://localhost:8443/api
  echo ""
done
```

---

## Testing with Real Domains Locally

If you want to test with real domain names locally (e.g., `mysite.local`):

### 1. Edit /etc/hosts

```bash
sudo nano /etc/hosts
```

Add:
```
127.0.0.1  mysite.local
127.0.0.1  api.mysite.local
127.0.0.1  web.mysite.local
```

### 2. Generate Certificate for Your Domain

```bash
openssl req -x509 -newkey rsa:4096 \
  -keyout mysite.key \
  -out mysite.crt \
  -days 365 \
  -nodes \
  -subj "/CN=mysite.local" \
  -addext "subjectAltName=DNS:mysite.local,DNS:*.mysite.local"
```

### 3. Update Config

```json
{
  "8443": {
    "tls": {
      "cert": "./mysite.crt",
      "key": "./mysite.key"
    },
    "hosts": {
      "api.mysite.local": "http://localhost:3001",
      "web.mysite.local": "http://localhost:3000"
    }
  }
}
```

### 4. Test

```bash
curl -k https://mysite.local:8443/
curl -k https://api.mysite.local:8443/
```

---

## Troubleshooting

### Certificate Load Errors

**Error:** `Failed to load TLS certificates`

**Solution:** Check file paths are correct and files exist:
```bash
ls -la localhost.crt localhost.key
```

Make sure paths in config are relative to where you run the proxy from.

### Port Already in Use

**Error:** `Port 8443 is already in use`

**Solution:** Use different port or kill existing process:
```bash
# Find process using port 8443
lsof -i :8443

# Kill it (replace PID with actual process ID)
kill -9 <PID>
```

### Connection Refused

**Error:** `curl: (7) Failed to connect`

**Solution:** Make sure:
1. Proxy is running (`node dist/app.js run --rules tls-test.json`)
2. Backend is running (e.g., `node test-backend.js`)
3. Using correct port number

### Browser Certificate Error

**Error:** Browser shows "Your connection is not private"

**Solution:** This is expected with self-signed certificates. Click "Advanced" and proceed. For production, use real certificates from Let's Encrypt or a CA.

---

## Complete Test Script

Here's a complete bash script to test everything:

```bash
#!/bin/bash
# test-tls.sh

set -e

echo "=== TLS Local Testing Script ==="

# 1. Generate certificate
echo "1. Generating self-signed certificate..."
if [ ! -f localhost.crt ] || [ ! -f localhost.key ]; then
  openssl req -x509 -newkey rsa:4096 \
    -keyout localhost.key \
    -out localhost.crt \
    -days 365 \
    -nodes \
    -subj "/CN=localhost" 2>/dev/null
  echo "✓ Certificate created"
else
  echo "✓ Certificate already exists"
fi

# 2. Create test backend
echo "2. Creating test backend..."
cat > test-backend-temp.js <<'EOF'
const http = require('http');
const server = http.createServer((req, res) => {
  console.log(`[Backend] ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Hello from backend!',
    url: req.url,
    headers: req.headers,
  }, null, 2));
});
server.listen(3000, () => console.log('Backend ready on :3000'));
EOF

# 3. Create config
echo "3. Creating proxy config..."
cat > tls-test-temp.json <<'EOF'
{
  "__defaults": {
    "headers": {
      "x_forwarded": true
    }
  },
  "8080": {
    "/": {
      "type": "redirect",
      "to": "https://localhost:8443",
      "status": 301
    }
  },
  "8443": {
    "tls": {
      "cert": "./localhost.crt",
      "key": "./localhost.key"
    },
    "*": "http://localhost:3000"
  }
}
EOF

echo ""
echo "=== Setup Complete ==="
echo ""
echo "To test:"
echo "1. In terminal 1: node test-backend-temp.js"
echo "2. In terminal 2: npm run build && node dist/app.js run --rules tls-test-temp.json"
echo "3. In terminal 3: curl -k https://localhost:8443/test"
echo ""
echo "Files created:"
echo "  - localhost.crt (certificate)"
echo "  - localhost.key (private key)"
echo "  - test-backend-temp.js (test backend server)"
echo "  - tls-test-temp.json (proxy configuration)"
echo ""
```

Save and run:
```bash
chmod +x test-tls.sh
./test-tls.sh
```

---

## Integration Test Example

You can also create an automated integration test:

```javascript
// test-tls-integration.js
const https = require('https');
const http = require('http');

async function testTLS() {
  console.log('Testing HTTPS proxy...');

  const options = {
    hostname: 'localhost',
    port: 8443,
    path: '/test',
    method: 'GET',
    rejectUnauthorized: false, // Accept self-signed cert
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('✓ HTTPS request successful');
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
        resolve();
      });
    });

    req.on('error', reject);
    req.end();
  });
}

testTLS().catch(console.error);
```

Run it:
```bash
node test-tls-integration.js
```

---

## Cleanup

To remove test files:

```bash
rm -f localhost.crt localhost.key
rm -f tls-test.json tls-test-temp.json
rm -f test-backend.js test-backend-temp.js
rm -f test-tls-integration.js
```
