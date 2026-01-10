# Production Deployment Guide

Complete step-by-step guide to deploy the proxy server in production with Let's Encrypt SSL certificates.

---

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Server with Ubuntu 20.04+** (or similar Linux distro)
- [ ] **Domain name** (e.g., example.com)
- [ ] **DNS configured** (A record pointing to your server's IP)
- [ ] **Ports 80 and 443 open** in firewall
- [ ] **Root/sudo access** to the server
- [ ] **Node.js 18+** installed
- [ ] **Git** installed

---

## Step-by-Step Deployment

### Step 1: Prepare the Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git build-essential certbot

# Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node --version  # Should be 18+
npm --version
certbot --version
```

### Step 2: Clone and Setup Project

```bash
# Clone repository (or upload your code)
cd /opt
sudo git clone https://github.com/yourusername/proxy-server.git
cd proxy-server

# Or create directory and copy files
sudo mkdir -p /opt/proxy-server
cd /opt/proxy-server
# ... copy your files here ...

# Install dependencies
npm install

# Install tsx globally for running TypeScript
npm install -g tsx
```

### Step 3: Configure DNS

Make sure your domain points to your server:

```bash
# Verify DNS is working
dig example.com +short
# Should return your server's IP address

# Test connectivity
ping example.com
```

### Step 4: Obtain SSL Certificate

```bash
# Get certificate for your domain(s)
sudo certbot certonly --standalone \
  -d example.com \
  -d www.example.com \
  -d api.example.com \
  --email admin@example.com \
  --agree-tos \
  --non-interactive

# Verify certificates were created
sudo ls -la /etc/letsencrypt/live/example.com/

# You should see:
# - fullchain.pem
# - privkey.pem
# - chain.pem
# - cert.pem
```

### Step 5: Set Certificate Permissions

```bash
# Create SSL certificates group
sudo groupadd sslcerts

# Add your application user to the group
sudo usermod -a -G sslcerts $USER
sudo usermod -a -G sslcerts www-data  # If using www-data

# Change group ownership
sudo chgrp -R sslcerts /etc/letsencrypt/live/
sudo chgrp -R sslcerts /etc/letsencrypt/archive/

# Set read permissions
sudo chmod -R g+rx /etc/letsencrypt/live/
sudo chmod -R g+rx /etc/letsencrypt/archive/

# Verify
sudo ls -la /etc/letsencrypt/live/example.com/
```

### Step 6: Create Production Configuration

```bash
cd /opt/proxy-server

# Copy template
cp src/configs/production-letsencrypt.json production.json

# Edit with your settings
nano production.json
```

**Update these values:**
- Replace `example.com` with your actual domain
- Update backend URLs (`http://localhost:3000`, etc.)
- Configure your virtual hosts
- Set up your routing rules

**Example minimal config:**
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
    "*": "http://localhost:3000"
  }
}
```

### Step 7: Test Configuration

```bash
# Start backend service first (your application)
# Example:
cd /path/to/your/app
npm start &

# Test proxy in foreground
cd /opt/proxy-server
sudo npx tsx src/app.ts start --rules production.json --pid-file /tmp/proxy-test.pid

# In another terminal, test:
curl https://example.com
curl -I http://example.com  # Should redirect to HTTPS

# Stop test
sudo npx tsx src/app.ts stop --pid-file /tmp/proxy-test.pid
```

### Step 8: Create systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/proxy-server.service
```

**Add this content:**
```ini
[Unit]
Description=Node.js Proxy Server with TLS
After=network.target

[Service]
Type=forking
User=root
Group=root
WorkingDirectory=/opt/proxy-server
ExecStart=/usr/local/bin/npx tsx src/app.ts start --rules production.json --pid-file /var/run/proxy.pid
ExecStop=/usr/local/bin/npx tsx src/app.ts stop --pid-file /var/run/proxy.pid
ExecReload=/usr/local/bin/npx tsx src/app.ts restart --rules production.json --pid-file /var/run/proxy.pid
Restart=on-failure
RestartSec=10
PIDFile=/var/run/proxy.pid

# Security
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=proxy-server

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
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

### Step 9: Configure Firewall

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall if not already enabled
sudo ufw enable

# Check status
sudo ufw status
```

### Step 10: Set Up Auto-Renewal

```bash
# Create renewal hook
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-proxy.sh
```

**Add:**
```bash
#!/bin/bash
systemctl reload proxy-server
```

**Make executable:**
```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-proxy.sh
```

**Test renewal:**
```bash
# Dry run (doesn't actually renew)
sudo certbot renew --dry-run

# If successful, certbot will auto-renew via systemd timer
# Verify timer is active
sudo systemctl status certbot.timer
```

### Step 11: Verify Production Deployment

```bash
# Test HTTPS
curl -I https://example.com

# Test HTTP redirect
curl -I http://example.com

# Test certificate validity
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null | openssl x509 -noout -dates

# Check logs
sudo journalctl -u proxy-server -n 50

# Check service status
sudo systemctl status proxy-server
```

### Step 12: Monitor and Maintain

```bash
# View real-time logs
sudo journalctl -u proxy-server -f

# Check certificate expiration
sudo certbot certificates

# Manual renewal test
sudo certbot renew --dry-run

# Restart service
sudo systemctl restart proxy-server

# View recent logs
sudo journalctl -u proxy-server -n 100 --no-pager
```

---

## Post-Deployment Checklist

- [ ] HTTPS working without certificate warnings
- [ ] HTTP redirects to HTTPS
- [ ] All subdomains working correctly
- [ ] Backend services accessible through proxy
- [ ] SSL Labs test shows A+ rating
- [ ] Certificate auto-renewal configured
- [ ] Systemd service starts on boot
- [ ] Firewall rules configured
- [ ] Logs accessible and monitored
- [ ] Backup strategy in place

---

## Testing Production Setup

### 1. SSL Test
```bash
# Online test
https://www.ssllabs.com/ssltest/analyze.html?d=example.com

# Should show: A+ rating
```

### 2. Performance Test
```bash
# Test response time
curl -w "@-" -o /dev/null -s https://example.com <<'EOF'
    time_namelookup:  %{time_namelookup}s\n
       time_connect:  %{time_connect}s\n
    time_appconnect:  %{time_appconnect}s\n
   time_pretransfer:  %{time_pretransfer}s\n
      time_redirect:  %{time_redirect}s\n
 time_starttransfer:  %{time_starttransfer}s\n
                     ----------\n
         time_total:  %{time_total}s\n
EOF
```

### 3. Load Test
```bash
# Install ab (Apache Bench)
sudo apt install apache2-utils

# Test with 1000 requests, 10 concurrent
ab -n 1000 -c 10 https://example.com/
```

### 4. Security Headers Test
```bash
curl -I https://example.com
# Check for security headers from your backend
```

---

## Common Production Issues

### Issue: Service won't start

**Check logs:**
```bash
sudo journalctl -u proxy-server -n 50
```

**Common causes:**
- Certificate permissions (check Step 5)
- Port already in use: `sudo lsof -i :443`
- Config syntax error: validate JSON
- Backend not running: check backend service

### Issue: Certificate expired

```bash
# Check expiration
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Reload proxy
sudo systemctl reload proxy-server
```

### Issue: High memory usage

```bash
# Check memory
free -h

# Check process
ps aux | grep proxy

# Restart if needed
sudo systemctl restart proxy-server
```

### Issue: Connection refused

**Check backend:**
```bash
# Test backend directly
curl http://localhost:3000

# Check if backend is running
ps aux | grep node
```

**Check firewall:**
```bash
sudo ufw status
```

---

## Backup Strategy

### 1. Backup Configuration
```bash
# Create backup directory
sudo mkdir -p /opt/backups/proxy

# Backup script
sudo nano /opt/backups/backup-proxy.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/proxy"

# Backup config
cp /opt/proxy-server/production.json $BACKUP_DIR/production-$DATE.json

# Backup certificates (optional, Let's Encrypt keeps archives)
tar -czf $BACKUP_DIR/letsencrypt-$DATE.tar.gz /etc/letsencrypt/

# Keep last 7 days
find $BACKUP_DIR -name "*.json" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

```bash
# Make executable
sudo chmod +x /opt/backups/backup-proxy.sh

# Add to cron (daily at 3 AM)
sudo crontab -e
# Add: 0 3 * * * /opt/backups/backup-proxy.sh
```

### 2. Backup Certificates
```bash
# Certificates auto-backed up by certbot in:
/etc/letsencrypt/archive/example.com/

# Manual backup
sudo tar -czf /opt/backups/certs-$(date +%Y%m%d).tar.gz /etc/letsencrypt/
```

---

## Monitoring Setup

### 1. Set Up Logging

```bash
# Configure logrotate
sudo nano /etc/logrotate.d/proxy-server
```

```
/var/log/proxy-server.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        systemctl reload proxy-server > /dev/null 2>&1 || true
    endscript
}
```

### 2. Set Up Monitoring

```bash
# Check service health every 5 minutes
crontab -e

# Add:
*/5 * * * * systemctl is-active --quiet proxy-server || systemctl restart proxy-server
```

### 3. Email Alerts

**For certificate expiration:** Certbot emails you automatically at the address you provided.

**For service failures:** Configure systemd to send emails on failure or use monitoring tools like:
- Prometheus + Grafana
- Datadog
- New Relic
- Custom scripts with email notifications

---

## Updating the Proxy

```bash
# Pull latest code
cd /opt/proxy-server
sudo git pull

# Install any new dependencies
npm install

# Test configuration
sudo npx tsx src/app.ts --help

# Restart service
sudo systemctl restart proxy-server

# Verify
sudo systemctl status proxy-server
```

---

## Rollback Procedure

```bash
# If something goes wrong:

# 1. Stop current version
sudo systemctl stop proxy-server

# 2. Restore previous config
sudo cp /opt/backups/proxy/production-20260110_120000.json /opt/proxy-server/production.json

# 3. Checkout previous git version (if using git)
cd /opt/proxy-server
sudo git checkout <previous-commit-hash>
npm install

# 4. Start service
sudo systemctl start proxy-server

# 5. Verify
curl -I https://example.com
```

---

## Performance Optimization

### 1. Enable Connection Keep-Alive
Already enabled by default in the proxy! ✅

### 2. Use HTTP/2
Currently HTTP/1.1. HTTP/2 support planned for future release.

### 3. Enable Compression
Add gzip compression at your backend or add it to the proxy (future feature).

### 4. Use CDN
Consider Cloudflare in front of your proxy for static assets.

### 5. Monitor Resource Usage
```bash
# CPU and memory
htop

# Network
iftop

# Disk I/O
iotop
```

---

## Security Hardening

### 1. Restrict SSH Access
```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Disable root login
PermitRootLogin no

# Use key-based auth only
PasswordAuthentication no

# Restart SSH
sudo systemctl restart sshd
```

### 2. Enable Fail2Ban
```bash
# Install
sudo apt install fail2ban

# Configure
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local

# Enable and start
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 3. Keep System Updated
```bash
# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## Summary

You now have a production-ready proxy server with:

- ✅ **Free SSL certificates** from Let's Encrypt
- ✅ **Automatic certificate renewal**
- ✅ **HTTP → HTTPS redirect**
- ✅ **Connection keep-alive** for performance
- ✅ **X-Forwarded headers** for backend visibility
- ✅ **Systemd service** for auto-start
- ✅ **Firewall configured**
- ✅ **Monitoring and logging**
- ✅ **Backup strategy**

Your proxy is ready to handle production traffic! 🚀

**Next Steps:**
- Set up monitoring dashboard
- Configure additional backends
- Add rate limiting (future feature)
- Implement health checks (future feature)
