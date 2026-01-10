# Using Let's Encrypt (Certbot) with the Proxy Server

This guide shows you how to use real SSL/TLS certificates from Let's Encrypt instead of self-signed certificates for production.

---

## Overview

**Let's Encrypt** provides free, automated SSL/TLS certificates that are trusted by all major browsers.

**Certbot** is the official Let's Encrypt client that automates certificate issuance and renewal.

---

## Prerequisites

1. **A domain name** pointing to your server (e.g., `example.com`, `api.example.com`)
2. **Port 80 accessible** (Certbot needs this for domain validation)
3. **Root/sudo access** on your server
4. **Server with public IP address**

---

## Step 1: Install Certbot

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install certbot
```

### CentOS/RHEL
```bash
sudo yum install certbot
```

### macOS (for testing only - Let's Encrypt requires public domain)
```bash
brew install certbot
```

### Verify Installation
```bash
certbot --version
```

---

## Step 2: Obtain SSL Certificate

### Option A: Standalone Mode (Recommended for First-Time Setup)

**Stop your proxy server first** (Certbot needs port 80):

```bash
# If running as daemon
npx tsx src/app.ts stop

# Or kill the process
pkill -f "tsx src/app.ts"
```

**Get certificate:**

```bash
# For a single domain
sudo certbot certonly --standalone -d example.com

# For multiple domains (main domain + www)
sudo certbot certonly --standalone -d example.com -d www.example.com

# For subdomain
sudo certbot certonly --standalone -d api.example.com

# For wildcard certificate (requires DNS challenge)
sudo certbot certonly --manual --preferred-challenges dns -d "*.example.com" -d example.com
```

**Follow the prompts:**
1. Enter your email address (for renewal notifications)
2. Agree to Terms of Service
3. Choose whether to share email with EFF (optional)
4. Wait for domain validation

**Success output:**
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/example.com/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/example.com/privkey.pem
```

### Option B: Webroot Mode (With Proxy Already Running)

If your proxy is already serving HTTP traffic:

```bash
# Create webroot directory
sudo mkdir -p /var/www/certbot

# Get certificate using webroot
sudo certbot certonly --webroot -w /var/www/certbot -d example.com
```

Then configure your proxy to serve the `.well-known/acme-challenge/` path from that directory.

---

## Step 3: Configure Proxy to Use Let's Encrypt Certificates

Create your production proxy configuration:

### Single Domain Example

```json
{
  "__defaults": {
    "headers": {
      "x_forwarded": true,
      "pass_host": false
    }
  },
  "80": {
    "/": {
      "type": "redirect",
      "to": "https://example.com",
      "status": 301
    }
  },
  "443": {
    "tls": {
      "cert": "/etc/letsencrypt/live/example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/example.com/privkey.pem"
    },
    "/api": {
      "type": "proxy",
      "to": ["http://localhost:3001", "http://localhost:3002"]
    },
    "*": "http://localhost:3000"
  }
}
```

**Important:** Use `fullchain.pem` (not `cert.pem`) to include intermediate certificates!

### Multiple Domains with Virtual Hosts

```json
{
  "__defaults": {
    "headers": {
      "x_forwarded": true,
      "pass_host": true
    }
  },
  "80": {
    "hosts": {
      "example.com": {
        "/": {
          "type": "redirect",
          "to": "https://example.com",
          "status": 301
        }
      },
      "api.example.com": {
        "/": {
          "type": "redirect",
          "to": "https://api.example.com",
          "status": 301
        }
      }
    }
  },
  "443": {
    "tls": {
      "cert": "/etc/letsencrypt/live/example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/example.com/privkey.pem"
    },
    "hosts": {
      "example.com": {
        "/": "http://localhost:3000"
      },
      "api.example.com": {
        "/v1": "http://localhost:4000",
        "/v2": "http://localhost:5000"
      }
    }
  }
}
```

**Note:** For multiple domains with different certificates, you'll need SNI (Server Name Indication) support, which requires running separate proxy instances or using a reverse proxy like nginx in front.

---

## Step 4: Set File Permissions

Let's Encrypt certificates are owned by root. You need to either:

### Option A: Run Proxy as Root (Not Recommended for Security)

```bash
sudo npx tsx src/app.ts start --rules production.json
```

### Option B: Give Node.js User Access to Certificates (Recommended)

```bash
# Create a group for certificate access
sudo groupadd sslcerts

# Add your user to the group
sudo usermod -a -G sslcerts $USER

# Change group ownership of Let's Encrypt directories
sudo chgrp -R sslcerts /etc/letsencrypt/live/
sudo chgrp -R sslcerts /etc/letsencrypt/archive/

# Set permissions
sudo chmod -R g+rx /etc/letsencrypt/live/
sudo chmod -R g+rx /etc/letsencrypt/archive/

# Log out and back in for group changes to take effect
exit
# Then log back in
```

### Option C: Copy Certificates to User Directory (Alternative)

```bash
# Create directory for certificates
mkdir -p ~/certs

# Copy certificates (must be done after each renewal)
sudo cp /etc/letsencrypt/live/example.com/fullchain.pem ~/certs/
sudo cp /etc/letsencrypt/live/example.com/privkey.pem ~/certs/
sudo chown $USER:$USER ~/certs/*.pem

# Update proxy config to use ~/certs/ instead
```

---

## Step 5: Start Proxy Server

### Development/Testing (Foreground)
```bash
npx tsx src/app.ts start --rules production.json
```

### Production (Daemon Mode)
```bash
# Start
sudo npx tsx src/app.ts start --rules production.json --pid-file /var/run/proxy.pid

# Stop
sudo npx tsx src/app.ts stop --pid-file /var/run/proxy.pid

# Restart
sudo npx tsx src/app.ts restart --rules production.json --pid-file /var/run/proxy.pid

# Status
sudo npx tsx src/app.ts status --pid-file /var/run/proxy.pid
```

---

## Step 6: Verify HTTPS is Working

### Test with curl
```bash
# Should return 200 OK with valid certificate
curl -v https://example.com

# Check certificate details
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null | openssl x509 -noout -dates -issuer
```

### Test with Browser
Open https://example.com in your browser. You should see:
- ✅ Padlock icon (secure connection)
- ✅ No certificate warnings
- ✅ Certificate issued by "Let's Encrypt Authority X3"

### Check SSL Labs
Test your SSL configuration:
```
https://www.ssllabs.com/ssltest/analyze.html?d=example.com
```

---

## Step 7: Automatic Certificate Renewal

Let's Encrypt certificates expire after **90 days**. Set up automatic renewal:

### Test Renewal (Dry Run)
```bash
sudo certbot renew --dry-run
```

### Set Up Automatic Renewal with Cron

```bash
# Edit crontab
sudo crontab -e

# Add this line to renew twice daily at 2:15 AM and 2:15 PM
15 2,14 * * * certbot renew --quiet --post-hook "npx tsx /path/to/proxy/src/app.ts restart --rules /path/to/production.json --pid-file /var/run/proxy.pid"
```

The `--post-hook` restarts your proxy after renewal so it loads the new certificates.

### Or Use Systemd Timer (Ubuntu 16.04+)

Certbot automatically installs a systemd timer. Verify it's enabled:

```bash
# Check renewal timer status
sudo systemctl status certbot.timer

# Enable if not enabled
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# View upcoming renewal schedule
sudo certbot renew --dry-run
```

### Add Reload Hook

Create a renewal hook to reload your proxy:

```bash
# Create hook script
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-proxy.sh
```

Add:
```bash
#!/bin/bash
npx tsx /path/to/proxy/src/app.ts restart --rules /path/to/production.json --pid-file /var/run/proxy.pid
```

Make it executable:
```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-proxy.sh
```

Now certbot will automatically restart your proxy after renewing certificates.

---

## Step 8: Production Deployment with systemd

Create a systemd service for automatic startup:

### Create Service File

```bash
sudo nano /etc/systemd/system/proxy-server.service
```

Add:
```ini
[Unit]
Description=Node.js Proxy Server
After=network.target

[Service]
Type=forking
User=your-username
Group=your-group
WorkingDirectory=/path/to/proxy/nodejs
ExecStart=/usr/bin/npx tsx src/app.ts start --rules production.json --pid-file /var/run/proxy.pid
ExecStop=/usr/bin/npx tsx src/app.ts stop --pid-file /var/run/proxy.pid
Restart=on-failure
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true

# Allow binding to privileged ports (80, 443)
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```

### Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable proxy-server

# Start service
sudo systemctl start proxy-server

# Check status
sudo systemctl status proxy-server

# View logs
sudo journalctl -u proxy-server -f
```

### Service Management

```bash
# Start
sudo systemctl start proxy-server

# Stop
sudo systemctl stop proxy-server

# Restart
sudo systemctl restart proxy-server

# Status
sudo systemctl status proxy-server

# View logs
sudo journalctl -u proxy-server -n 100 --no-pager
```

---

## Complete Production Example

### 1. DNS Setup
```
A     example.com        -> 203.0.113.1
A     www.example.com    -> 203.0.113.1
A     api.example.com    -> 203.0.113.1
```

### 2. Obtain Certificates
```bash
sudo certbot certonly --standalone \
  -d example.com \
  -d www.example.com \
  -d api.example.com \
  --email admin@example.com \
  --agree-tos
```

### 3. Create Production Config (`production.json`)

```json
{
  "__defaults": {
    "headers": {
      "x_forwarded": true,
      "pass_host": true
    }
  },
  "80": {
    "hosts": {
      "example.com": {
        "/.well-known/acme-challenge": "http://localhost:8888",
        "/": {
          "type": "redirect",
          "to": "https://example.com",
          "status": 301
        }
      },
      "www.example.com": {
        "/": {
          "type": "redirect",
          "to": "https://example.com",
          "status": 301
        }
      },
      "api.example.com": {
        "/": {
          "type": "redirect",
          "to": "https://api.example.com",
          "status": 301
        }
      }
    }
  },
  "443": {
    "tls": {
      "cert": "/etc/letsencrypt/live/example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/example.com/privkey.pem"
    },
    "hosts": {
      "example.com": {
        "/api": {
          "type": "proxy",
          "to": ["http://localhost:3001", "http://localhost:3002", "http://localhost:3003"]
        },
        "/static": "http://localhost:8080",
        "*": "http://localhost:3000"
      },
      "www.example.com": {
        "/": {
          "type": "redirect",
          "to": "https://example.com",
          "status": 301
        }
      },
      "api.example.com": {
        "/v1": "http://localhost:4000",
        "/v2": "http://localhost:5000"
      }
    }
  }
}
```

### 4. Set Permissions
```bash
sudo groupadd sslcerts
sudo usermod -a -G sslcerts $USER
sudo chgrp -R sslcerts /etc/letsencrypt/live/
sudo chgrp -R sslcerts /etc/letsencrypt/archive/
sudo chmod -R g+rx /etc/letsencrypt/live/
sudo chmod -R g+rx /etc/letsencrypt/archive/
```

### 5. Start Proxy
```bash
sudo systemctl start proxy-server
```

### 6. Verify
```bash
# Test main domain
curl -I https://example.com

# Test API subdomain
curl https://api.example.com/v1/health

# Test redirect
curl -I http://example.com  # Should redirect to HTTPS
```

---

## Troubleshooting

### Issue: "Permission denied" reading certificates

**Solution:**
```bash
# Verify permissions
ls -l /etc/letsencrypt/live/example.com/

# Add user to sslcerts group (see Step 4, Option B)
sudo usermod -a -G sslcerts $USER

# Or run proxy as root (not recommended)
sudo npx tsx src/app.ts start --rules production.json
```

### Issue: "Port 80 already in use" during certificate renewal

**Solution:**
```bash
# Use standalone mode with temporary stop
sudo systemctl stop proxy-server
sudo certbot renew
sudo systemctl start proxy-server

# Or use webroot mode to avoid stopping proxy
sudo certbot renew --webroot -w /var/www/certbot
```

### Issue: Certificate not found after renewal

**Solution:**
Certificates are symlinks. Make sure your proxy can read both:
- `/etc/letsencrypt/live/example.com/` (symlinks)
- `/etc/letsencrypt/archive/example.com/` (actual files)

### Issue: Browser shows certificate is for wrong domain

**Solution:**
Make sure you obtained a certificate for all domains you're serving:
```bash
# Check what domains are in the certificate
sudo certbot certificates

# Add more domains to existing certificate
sudo certbot certonly --cert-name example.com -d example.com -d newdomain.com
```

---

## Security Best Practices

1. **Use Strong TLS Configuration**
   - Let's Encrypt automatically uses strong ciphers
   - Keep certificates up to date (auto-renewal)

2. **Enable HSTS (HTTP Strict Transport Security)**
   - Add to your backend response headers:
   ```
   Strict-Transport-Security: max-age=31536000; includeSubDomains
   ```

3. **Use Separate Certificates for Different Services**
   - Don't share certificates between unrelated domains
   - Use wildcards carefully

4. **Monitor Certificate Expiration**
   - Set up monitoring (Certbot emails you)
   - Test renewal regularly with `--dry-run`

5. **Protect Private Keys**
   - Never commit certificate files to git
   - Restrict file permissions (600 for keys)
   - Back up certificates securely

6. **Regular Security Audits**
   - Test with SSL Labs (https://www.ssllabs.com/ssltest/)
   - Keep Node.js and dependencies updated
   - Monitor security advisories

---

## Summary

**To use Let's Encrypt with your proxy:**

1. ✅ Get a domain name and point it to your server
2. ✅ Install Certbot
3. ✅ Obtain certificate: `sudo certbot certonly --standalone -d example.com`
4. ✅ Configure proxy to use `/etc/letsencrypt/live/example.com/fullchain.pem`
5. ✅ Set up auto-renewal with cron or systemd timer
6. ✅ Create systemd service for production deployment

Your proxy will now have **free, trusted SSL certificates** that automatically renew! 🎉
