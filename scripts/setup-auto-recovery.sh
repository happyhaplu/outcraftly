#!/bin/bash

# Setup Auto-Recovery System
# Run this once on the server: bash setup-auto-recovery.sh

echo "======================================"
echo "🚀 SETTING UP AUTO-RECOVERY SYSTEM"
echo "======================================"
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root or with sudo"
    exit 1
fi

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Detect environment
CURRENT_DIR=$(pwd)
if [[ "$CURRENT_DIR" == *"staging"* ]]; then
    ENV="staging"
    SCRIPT_DIR="/home/ubuntu/outcraftly-staging/scripts"
elif [[ "$CURRENT_DIR" == *"production"* ]]; then
    ENV="production"
    SCRIPT_DIR="/home/ubuntu/outcraftly-production/scripts"
else
    echo "Cannot detect environment. Please specify script directory:"
    read -p "Enter full path to scripts directory: " SCRIPT_DIR
fi

echo "Environment: $ENV"
echo "Scripts directory: $SCRIPT_DIR"
echo ""

# Create log directory
mkdir -p /var/log/outcraftly
chown ubuntu:ubuntu /var/log/outcraftly

echo "✓ Created log directory"

# Make scripts executable
chmod +x "$SCRIPT_DIR/diagnose-server-issues.sh"
chmod +x "$SCRIPT_DIR/fix-server-issues.sh"
chmod +x "$SCRIPT_DIR/fix-nginx-config.sh"
chmod +x "$SCRIPT_DIR/monitor-and-recover.sh"

echo "✓ Made scripts executable"

# Setup cron job for monitoring
CRON_JOB="*/5 * * * * $SCRIPT_DIR/monitor-and-recover.sh >> /var/log/outcraftly/monitor.log 2>&1"

# Check if cron job already exists
if crontab -l -u ubuntu 2>/dev/null | grep -q "monitor-and-recover.sh"; then
    echo "⚠️  Cron job already exists, updating..."
    crontab -l -u ubuntu 2>/dev/null | grep -v "monitor-and-recover.sh" | crontab -u ubuntu -
fi

# Add cron job
(crontab -l -u ubuntu 2>/dev/null; echo "$CRON_JOB") | crontab -u ubuntu -

echo "✓ Added cron job for auto-recovery (runs every 5 minutes)"

# Setup log rotation
cat > /etc/logrotate.d/outcraftly << 'EOF'
/var/log/outcraftly/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 ubuntu ubuntu
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}

/home/ubuntu/.pm2/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 ubuntu ubuntu
}

/var/log/nginx/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
EOF

echo "✓ Configured log rotation"

# Create systemd service for PM2 (as backup to cron)
cat > /etc/systemd/system/outcraftly-watchdog.service << EOF
[Unit]
Description=Outcraftly Watchdog Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$SCRIPT_DIR
ExecStart=/bin/bash $SCRIPT_DIR/monitor-and-recover.sh
Restart=always
RestartSec=300
StandardOutput=append:/var/log/outcraftly/watchdog.log
StandardError=append:/var/log/outcraftly/watchdog-error.log

[Install]
WantedBy=multi-user.target
EOF

# Enable but don't start (cron is primary, this is backup)
systemctl daemon-reload
systemctl enable outcraftly-watchdog.service

echo "✓ Created systemd watchdog service (backup monitoring)"

# Setup PM2 startup
su - ubuntu -c "pm2 startup systemd -u ubuntu --hp /home/ubuntu" | grep -E "^sudo" | bash

echo "✓ Configured PM2 to start on boot"

# Create quick fix aliases
cat > /home/ubuntu/.bash_aliases << EOF
# Outcraftly quick commands
alias outcraftly-status='pm2 list && systemctl status nginx --no-pager'
alias outcraftly-logs='pm2 logs --lines 50'
alias outcraftly-diagnose='bash $SCRIPT_DIR/diagnose-server-issues.sh'
alias outcraftly-fix='bash $SCRIPT_DIR/fix-server-issues.sh'
alias outcraftly-monitor='tail -f /var/log/outcraftly/monitor.log'
alias outcraftly-restart='pm2 restart all && sudo systemctl reload nginx'
EOF

chown ubuntu:ubuntu /home/ubuntu/.bash_aliases

echo "✓ Created command aliases"

# Test the setup
echo ""
echo "Testing setup..."
echo ""

# Run initial diagnostic
su - ubuntu -c "bash $SCRIPT_DIR/diagnose-server-issues.sh" > /tmp/initial-diagnostic.txt 2>&1
echo "✓ Initial diagnostic saved to /tmp/initial-diagnostic.txt"

# Verify cron
if crontab -l -u ubuntu | grep -q "monitor-and-recover.sh"; then
    echo "✓ Cron job verified"
else
    echo "✗ Cron job not found"
fi

echo ""
echo "======================================"
echo "✅ AUTO-RECOVERY SYSTEM INSTALLED"
echo "======================================"
echo ""
echo "System will now:"
echo "  • Monitor app health every 5 minutes"
echo "  • Auto-restart failed processes"
echo "  • Auto-restart on high restarts"
echo "  • Monitor memory usage"
echo "  • Rotate logs automatically"
echo "  • Start PM2 on server boot"
echo ""
echo "Quick commands (available after logout/login):"
echo "  outcraftly-status    - Show status"
echo "  outcraftly-logs      - View logs"
echo "  outcraftly-diagnose  - Run diagnostics"
echo "  outcraftly-fix       - Fix issues"
echo "  outcraftly-monitor   - Watch monitor log"
echo "  outcraftly-restart   - Restart all"
echo ""
echo "Manual commands:"
echo "  • View monitor log: tail -f /var/log/outcraftly/monitor.log"
echo "  • Run diagnostic: $SCRIPT_DIR/diagnose-server-issues.sh"
echo "  • Fix issues: $SCRIPT_DIR/fix-server-issues.sh"
echo "  • Fix Nginx: sudo $SCRIPT_DIR/fix-nginx-config.sh"
echo ""
echo "Next steps:"
echo "  1. Run: cd $SCRIPT_DIR/.."
echo "  2. Run: git pull origin release"
echo "  3. Run: bash scripts/fix-server-issues.sh"
echo "  4. Run: sudo bash scripts/fix-nginx-config.sh"
echo "  5. Monitor: tail -f /var/log/outcraftly/monitor.log"
echo ""
