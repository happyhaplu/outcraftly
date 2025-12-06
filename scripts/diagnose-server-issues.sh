#!/bin/bash

# Server Diagnostic Script for 502/504 Gateway Timeout Issues
# Run this on the server: bash diagnose-server-issues.sh

echo "======================================"
echo "🔍 OUTCRAFTLY SERVER DIAGNOSTICS"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print section headers
print_section() {
    echo ""
    echo "======================================"
    echo "📊 $1"
    echo "======================================"
}

# Function to check status
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
    else
        echo -e "${RED}✗ $1${NC}"
    fi
}

print_section "1. SYSTEM RESOURCES"
echo "Memory Usage:"
free -h
echo ""
echo "Disk Usage:"
df -h /
echo ""
echo "CPU Load:"
uptime
echo ""
echo "Top Memory Consumers:"
ps aux --sort=-%mem | head -10

print_section "2. PM2 PROCESS STATUS"
pm2 list
echo ""
echo "PM2 Process Info:"
pm2 info outcraftly-app 2>/dev/null || echo "outcraftly-app not found"
pm2 info outcraftly-staging 2>/dev/null || echo "outcraftly-staging not found"
pm2 info outcraftly-production 2>/dev/null || echo "outcraftly-production not found"

print_section "3. PM2 RESTART HISTORY"
echo "Recent Restarts (last 24 hours):"
pm2 list | grep -E "restart|online|stopped"
echo ""
echo "PM2 Logs (last 50 lines - errors):"
pm2 logs --err --lines 50 --nostream

print_section "4. NGINX STATUS"
echo "Nginx Status:"
sudo systemctl status nginx --no-pager | head -20
echo ""
echo "Nginx Error Log (last 50 lines):"
sudo tail -50 /var/log/nginx/error.log
echo ""
echo "Nginx Access Log (last 20 502/504 errors):"
sudo grep -E "502|504" /var/log/nginx/access.log | tail -20

print_section "5. APPLICATION HEALTH CHECK"
echo "Checking localhost:3000..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\nTime: %{time_total}s\n" http://localhost:3000/api/health 2>&1 || echo "Failed to connect"
echo ""
echo "Checking localhost:3001..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\nTime: %{time_total}s\n" http://localhost:3001/api/health 2>&1 || echo "Failed to connect"

print_section "6. PORT LISTENING STATUS"
echo "Ports 3000 and 3001:"
sudo netstat -tlnp | grep -E ":3000|:3001"
echo ""
echo "All Node processes:"
ps aux | grep node | grep -v grep

print_section "7. NGINX CONFIGURATION"
echo "Staging config:"
sudo cat /etc/nginx/sites-available/staging.outcraftly.com 2>/dev/null || echo "Config not found"
echo ""
echo "Production config:"
sudo cat /etc/nginx/sites-available/app.outcraftly.com 2>/dev/null || echo "Config not found"

print_section "8. DATABASE CONNECTION"
echo "Testing database connectivity..."
if [ -f .env ]; then
    POSTGRES_URL=$(grep POSTGRES_URL .env | cut -d '=' -f2-)
    if [ ! -z "$POSTGRES_URL" ]; then
        echo "Database URL configured: ${POSTGRES_URL:0:30}..."
    else
        echo -e "${RED}❌ POSTGRES_URL not found in .env${NC}"
    fi
else
    echo -e "${RED}❌ .env file not found${NC}"
fi

print_section "9. RECENT APPLICATION LOGS"
echo "Application logs (last 100 lines):"
pm2 logs --lines 100 --nostream 2>/dev/null | tail -100

print_section "10. SYSTEM JOURNAL ERRORS"
echo "Recent systemd errors:"
sudo journalctl -p err -n 50 --no-pager

print_section "DIAGNOSTIC SUMMARY"
echo ""
echo "Common Issues to Check:"
echo "1. PM2 app status - should be 'online'"
echo "2. Memory usage - should be < 80%"
echo "3. Application responding on localhost:3000/3001"
echo "4. Nginx upstream connection errors"
echo "5. Database connection configured"
echo ""
echo "Next Steps:"
echo "- If PM2 apps are stopped: Run fix-server-issues.sh"
echo "- If memory is high: Restart PM2 apps"
echo "- If ports not listening: Check application startup errors"
echo "- If Nginx errors: Check Nginx configuration"
echo ""
echo "======================================"
echo "✅ DIAGNOSTICS COMPLETE"
echo "======================================"
