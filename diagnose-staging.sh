#!/bin/bash
# Quick diagnostic script for staging VPS issues
# Usage: ./diagnose-staging.sh

SSH_KEY="$HOME/.ssh/id_ed25519"
VPS_HOST="ubuntu@155.133.26.49"

echo "🔍 Running diagnostics on staging VPS..."
echo ""

ssh -i "$SSH_KEY" "$VPS_HOST" << 'ENDSSH'
echo "=== PM2 Process Status ==="
pm2 list
echo ""

echo "=== Port 3000 Listener ==="
ss -tlnp 2>/dev/null | grep :3000 || echo "No listener on port 3000"
echo ""

echo "=== PM2 Environment Variables (Critical Ones) ==="
pm2 env 0 | grep -E 'POSTGRES_URL|DATABASE_URL|AUTH_SECRET|BASE_URL|NODE_ENV' | sed 's/\(.*=\)\(.*\)/\1[REDACTED]/'
echo ""

echo "=== Last 30 Log Lines ==="
pm2 logs outcraftly-staging --lines 30 --nostream
echo ""

echo "=== Recent Errors (Last 10) ==="
pm2 logs outcraftly-staging --err --lines 10 --nostream || echo "No error logs"
echo ""

echo "=== Health Check (Local) ==="
curl -s http://localhost:3000/api/health | jq . || echo "Health endpoint unreachable"
echo ""

echo "=== Memory Usage ==="
free -h
echo ""

echo "=== Disk Usage ==="
df -h /home/ubuntu
echo ""

echo "=== System Time ==="
timedatectl status | grep -E "Local time|Time zone|System clock synchronized"
ENDSSH

echo ""
echo "✅ Diagnostics complete!"
