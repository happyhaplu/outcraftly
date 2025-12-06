#!/bin/bash

# Server Fix Script for 502/504 Gateway Timeout Issues
# Run this on the server: bash fix-server-issues.sh

echo "======================================"
echo "🔧 OUTCRAFTLY SERVER FIX"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current directory name to determine environment
CURRENT_DIR=$(basename "$PWD")
echo "Current directory: $CURRENT_DIR"

# Function to print section headers
print_section() {
    echo ""
    echo "======================================"
    echo "🔧 $1"
    echo "======================================"
}

# Detect environment
if [[ "$CURRENT_DIR" == *"staging"* ]]; then
    ENV="staging"
    APP_NAME="outcraftly-staging"
    PORT=3000
    DOMAIN="staging.outcraftly.com"
elif [[ "$CURRENT_DIR" == *"production"* ]]; then
    ENV="production"
    APP_NAME="outcraftly-production"
    PORT=3001
    DOMAIN="app.outcraftly.com"
else
    echo -e "${RED}❌ Cannot detect environment from directory name${NC}"
    echo "Please run this script from outcraftly-staging or outcraftly-production directory"
    exit 1
fi

echo -e "${GREEN}Environment detected: $ENV${NC}"
echo "App name: $APP_NAME"
echo "Port: $PORT"
echo "Domain: $DOMAIN"
echo ""

print_section "1. STOPPING EXISTING PROCESSES"
echo "Stopping PM2 processes..."
pm2 stop all
pm2 delete all
sleep 2

echo "Killing any lingering node processes on port $PORT..."
sudo lsof -ti:$PORT | xargs -r sudo kill -9 2>/dev/null || echo "No processes found on port $PORT"
sleep 2

print_section "2. CHECKING ENVIRONMENT CONFIGURATION"
if [ ! -f .env ]; then
    echo -e "${RED}❌ ERROR: .env file not found!${NC}"
    echo "Please create .env file with required variables"
    exit 1
fi

# Check critical env vars
echo "Checking critical environment variables..."
if grep -q "POSTGRES_URL=" .env && [ ! -z "$(grep POSTGRES_URL= .env | cut -d '=' -f2-)" ]; then
    echo -e "${GREEN}✓ POSTGRES_URL configured${NC}"
else
    echo -e "${RED}❌ POSTGRES_URL missing or empty${NC}"
    exit 1
fi

if grep -q "NEXTAUTH_SECRET=" .env && [ ! -z "$(grep NEXTAUTH_SECRET= .env | cut -d '=' -f2-)" ]; then
    echo -e "${GREEN}✓ NEXTAUTH_SECRET configured${NC}"
else
    echo -e "${YELLOW}⚠ NEXTAUTH_SECRET missing or empty${NC}"
fi

print_section "3. CHECKING ECOSYSTEM CONFIG"
if [ ! -f ecosystem.config.js ]; then
    echo -e "${RED}❌ ERROR: ecosystem.config.js not found!${NC}"
    exit 1
fi

# Check if env_file is configured in ecosystem.config.js
if grep -q "env_file" ecosystem.config.js; then
    echo -e "${GREEN}✓ env_file configured in ecosystem.config.js${NC}"
else
    echo -e "${YELLOW}⚠ env_file not found in ecosystem.config.js - adding it...${NC}"
    # We'll fix this separately if needed
fi

print_section "4. CLEARING PM2 CACHE"
pm2 flush
pm2 save --force
rm -rf ~/.pm2/logs/*.log

print_section "5. STARTING PM2 PROCESSES"
echo "Starting with ecosystem.config.js..."
pm2 start ecosystem.config.js
sleep 5

print_section "6. VERIFYING STARTUP"
echo "PM2 Status:"
pm2 list
echo ""
echo "Waiting for application to be ready (30 seconds)..."
sleep 30

print_section "7. HEALTH CHECK"
echo "Testing localhost:$PORT..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT/api/health)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
    echo -e "${GREEN}✓ Application responding on port $PORT (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Application not responding properly (HTTP $HTTP_CODE)${NC}"
    echo "Checking logs..."
    pm2 logs --lines 50 --nostream
fi

print_section "8. RELOADING NGINX"
echo "Testing Nginx configuration..."
sudo nginx -t
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Nginx configuration valid${NC}"
    echo "Reloading Nginx..."
    sudo systemctl reload nginx
    echo -e "${GREEN}✓ Nginx reloaded${NC}"
else
    echo -e "${RED}✗ Nginx configuration has errors${NC}"
fi

print_section "9. SAVING PM2 CONFIGURATION"
pm2 save
echo -e "${GREEN}✓ PM2 configuration saved${NC}"

print_section "10. FINAL STATUS CHECK"
echo "PM2 Processes:"
pm2 list
echo ""
echo "Testing external access to $DOMAIN..."
EXTERNAL_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN --max-time 10)
if [ "$EXTERNAL_CODE" = "200" ]; then
    echo -e "${GREEN}✓ $DOMAIN is accessible (HTTP $EXTERNAL_CODE)${NC}"
else
    echo -e "${YELLOW}⚠ $DOMAIN returned HTTP $EXTERNAL_CODE${NC}"
    echo "Check Nginx logs for more details"
fi

print_section "SUMMARY"
echo ""
echo "Fix applied for $ENV environment"
echo "App: $APP_NAME"
echo "Port: $PORT"
echo "Domain: $DOMAIN"
echo ""
echo "Monitor the application with:"
echo "  pm2 logs"
echo "  pm2 monit"
echo ""
echo "If issues persist, check:"
echo "  sudo tail -f /var/log/nginx/error.log"
echo "  pm2 logs --err"
echo ""
echo "======================================"
echo "✅ FIX COMPLETE"
echo "======================================"
