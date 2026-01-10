# Certbot Quick Reference

Quick commands for managing Let's Encrypt SSL certificates with your proxy server.

---

## Initial Setup

### Install Certbot
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install certbot

# CentOS/RHEL
sudo yum install certbot

# macOS (Homebrew)
brew install certbot
```

---

## Get Certificates

### Single Domain
```bash
sudo certbot certonly --standalone -d example.com
```

### Multiple Domains (Same Certificate)
```bash
sudo certbot certonly --standalone \
  -d example.com \
  -d www.example.com \
  -d api.example.com
```

### Wildcard Certificate (Requires DNS Challenge)
```bash
sudo certbot certonly --manual \
  --preferred-challenges dns \
  -d "*.example.com" \
  -d example.com
```

### Using Webroot (Proxy Running)
```bash
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d example.com
```

---

## Certificate Locations

After running Certbot, certificates are saved at:

```bash
# Certificate (with chain)
/etc/letsencrypt/live/example.com/fullchain.pem

# Private key
/etc/letsencrypt/live/example.com/privkey.pem

# Certificate only (without chain) - DON'T USE THIS
/etc/letsencrypt/live/example.com/cert.pem

# Chain only
/etc/letsencrypt/live/example.com/chain.pem
```

**Always use `fullchain.pem` in your proxy config!**

---

## Proxy Configuration

### Basic HTTPS Config
```json
{
  "443": {
    "tls": {
      "cert": "/etc/letsencrypt/live/example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/example.com/privkey.pem"
    },
    "*": "http://localhost:3000"
  }
}
```

### With HTTP → HTTPS Redirect
```json
{
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
    "*": "http://localhost:3000"
  }
}
```

---

## Certificate Management

### List All Certificates
```bash
sudo certbot certificates
```

### Renew All Certificates
```bash
sudo certbot renew
```

### Renew Specific Certificate
```bash
sudo certbot renew --cert-name example.com
```

### Test Renewal (Dry Run)
```bash
sudo certbot renew --dry-run
```

### Force Renew (Before Expiration)
```bash
sudo certbot renew --force-renewal
```

### Revoke Certificate
```bash
sudo certbot revoke --cert-path /etc/letsencrypt/live/example.com/cert.pem
```

### Delete Certificate
```bash
sudo certbot delete --cert-name example.com
```

---

## Renewal Automation

### Cron (Runs at 2:15 AM and 2:15 PM daily)
```bash
# Edit root crontab
sudo crontab -e

# Add this line
15 2,14 * * * certbot renew --quiet --post-hook "systemctl restart proxy-server"
```

### Systemd Timer (Ubuntu 16.04+)
```bash
# Check status
sudo systemctl status certbot.timer

# Enable
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# List upcoming runs
sudo systemctl list-timers | grep certbot
```

### Post-Renewal Hook
```bash
# Create hook script
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-proxy.sh

# Add:
#!/bin/bash
systemctl restart proxy-server

# Make executable
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-proxy.sh
```

---

## File Permissions

### Option 1: Run Proxy as Root (Not Recommended)
```bash
sudo npx tsx src/app.ts start --rules production.json
```

### Option 2: Grant Access to Certificate Group (Recommended)
```bash
# Create group
sudo groupadd sslcerts

# Add your user
sudo usermod -a -G sslcerts $USER

# Change group ownership
sudo chgrp -R sslcerts /etc/letsencrypt/live/
sudo chgrp -R sslcerts /etc/letsencrypt/archive/

# Set permissions
sudo chmod -R g+rx /etc/letsencrypt/live/
sudo chmod -R g+rx /etc/letsencrypt/archive/

# Log out and back in
exit
```

### Option 3: Copy Certificates
```bash
mkdir -p ~/certs
sudo cp /etc/letsencrypt/live/example.com/fullchain.pem ~/certs/
sudo cp /etc/letsencrypt/live/example.com/privkey.pem ~/certs/
sudo chown $USER:$USER ~/certs/*.pem
```

---

## Proxy Server Management

### Start Proxy
```bash
# Development
npx tsx src/app.ts start --rules production.json

# Production (daemon)
sudo npx tsx src/app.ts start --rules production.json --pid-file /var/run/proxy.pid
```

### Stop Proxy
```bash
sudo npx tsx src/app.ts stop --pid-file /var/run/proxy.pid
```

### Restart After Certificate Renewal
```bash
sudo npx tsx src/app.ts restart --rules production.json --pid-file /var/run/proxy.pid
```

---

## Testing & Verification

### Test HTTPS
```bash
curl -v https://example.com
```

### Check Certificate Details
```bash
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null | openssl x509 -noout -dates -issuer
```

### Test Certificate Expiration
```bash
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null | openssl x509 -noout -dates
```

### SSL Labs Test
```
https://www.ssllabs.com/ssltest/analyze.html?d=example.com
```

### Test HTTP to HTTPS Redirect
```bash
curl -I http://example.com
# Should see: Location: https://example.com
```

---

## Troubleshooting

### Check Certificate Status
```bash
sudo certbot certificates
```

### View Renewal Configuration
```bash
sudo cat /etc/letsencrypt/renewal/example.com.conf
```

### Test Renewal Without Actually Renewing
```bash
sudo certbot renew --dry-run
```

### View Certbot Logs
```bash
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

### Fix "Port 80 in Use" During Renewal
```bash
# Stop proxy temporarily
sudo systemctl stop proxy-server

# Renew
sudo certbot renew

# Start proxy
sudo systemctl start proxy-server
```

### Check Proxy Logs
```bash
# If using systemd
sudo journalctl -u proxy-server -f

# If using daemon mode
tail -f /path/to/logs
```

---

## Common Issues

### "Permission denied" reading certificates
```bash
# Check permissions
ls -l /etc/letsencrypt/live/example.com/

# Fix with group access (see File Permissions above)
sudo usermod -a -G sslcerts $USER
```

### Certificate expired
```bash
# Check expiration
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Restart proxy
sudo systemctl restart proxy-server
```

### Wrong certificate served
```bash
# Verify certificate includes all domains
sudo certbot certificates

# Add more domains
sudo certbot certonly --cert-name example.com \
  -d example.com \
  -d www.example.com \
  -d api.example.com
```

---

## Certificate Renewal Timeline

- **Day 0**: Certificate issued (valid for 90 days)
- **Day 60**: Certbot will start attempting renewal
- **Day 89**: Last day before expiration warning emails
- **Day 90**: Certificate expires

**Best Practice:** Set up auto-renewal and test it regularly with `--dry-run`

---

## Emergency Commands

### Certificate Expired - Quick Fix
```bash
# Stop proxy
sudo systemctl stop proxy-server

# Force immediate renewal
sudo certbot renew --force-renewal

# Start proxy
sudo systemctl start proxy-server

# Verify
curl -v https://example.com
```

### Start Fresh (Delete and Recreate)
```bash
# Delete old certificate
sudo certbot delete --cert-name example.com

# Get new certificate
sudo certbot certonly --standalone -d example.com

# Restart proxy
sudo systemctl restart proxy-server
```

---

## Production Checklist

- [ ] Domain DNS points to server
- [ ] Certbot installed
- [ ] Certificates obtained
- [ ] Proxy config uses `fullchain.pem` and `privkey.pem`
- [ ] File permissions set (group access or copy)
- [ ] HTTP → HTTPS redirect configured
- [ ] Auto-renewal configured (cron or systemd timer)
- [ ] Post-renewal hook configured
- [ ] Tested with browser (no certificate warnings)
- [ ] SSL Labs scan shows A+ rating
- [ ] Monitoring set up for expiration alerts

---

## Quick Start Script

```bash
#!/bin/bash
# Quick setup for Let's Encrypt with proxy

DOMAIN="example.com"
EMAIL="admin@example.com"

# Install certbot
sudo apt update && sudo apt install -y certbot

# Get certificate
sudo certbot certonly --standalone \
  -d $DOMAIN \
  --email $EMAIL \
  --agree-tos \
  --non-interactive

# Set permissions
sudo groupadd sslcerts
sudo usermod -a -G sslcerts $USER
sudo chgrp -R sslcerts /etc/letsencrypt/live/
sudo chgrp -R sslcerts /etc/letsencrypt/archive/
sudo chmod -R g+rx /etc/letsencrypt/live/
sudo chmod -R g+rx /etc/letsencrypt/archive/

# Set up auto-renewal
echo '15 2,14 * * * certbot renew --quiet --post-hook "systemctl restart proxy-server"' | sudo crontab -

echo "✓ Certificate obtained for $DOMAIN"
echo "✓ Certificates at: /etc/letsencrypt/live/$DOMAIN/"
echo "✓ Auto-renewal configured"
echo ""
echo "Update your proxy config to use:"
echo "  cert: /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "  key:  /etc/letsencrypt/live/$DOMAIN/privkey.pem"
```

---

## Summary

**3-Step Setup:**

1. **Get certificate:**
   ```bash
   sudo certbot certonly --standalone -d example.com
   ```

2. **Configure proxy:**
   ```json
   {
     "443": {
       "tls": {
         "cert": "/etc/letsencrypt/live/example.com/fullchain.pem",
         "key": "/etc/letsencrypt/live/example.com/privkey.pem"
       },
       "*": "http://localhost:3000"
     }
   }
   ```

3. **Set up auto-renewal:**
   ```bash
   sudo certbot renew --dry-run
   ```

**Done!** 🎉 Free, trusted SSL certificates that renew automatically.
