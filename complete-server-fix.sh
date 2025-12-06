#!/bin/bash
# Complete Server Fix Script - Run this on the server
# SSH: ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49

set -e

echo "========================================="
echo "Outcraftly Server 502/504 Fix"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Stopping all PM2 processes and cleaning up${NC}"
pm2 delete all 2>/dev/null || true
pkill -9 -f "next start" 2>/dev/null || true
pkill -9 -f "tsx.*run-sequence-worker" 2>/dev/null || true
pkill -9 -f "tsx.*run-reply-worker" 2>/dev/null || true
sleep 3

echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""
free -h
echo ""

echo -e "${YELLOW}Step 2: Pulling latest code from GitHub${NC}"
cd /home/ubuntu/outcraftly-staging
git pull origin main
cd /home/ubuntu/outcraftly-production
git pull origin release
echo -e "${GREEN}✓ Code updated${NC}"
echo ""

echo -e "${YELLOW}Step 3: Rebuilding STAGING application${NC}"
cd /home/ubuntu/outcraftly-staging
rm -rf .next
pnpm install
pnpm build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Staging build successful${NC}"
else
    echo -e "${RED}✗ Staging build failed - check for code errors${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 4: Rebuilding PRODUCTION application${NC}"
cd /home/ubuntu/outcraftly-production
rm -rf .next
pnpm install
pnpm build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Production build successful${NC}"
else
    echo -e "${RED}✗ Production build failed - check for code errors${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 5: Starting STAGING services${NC}"
cd /home/ubuntu/outcraftly-staging
pm2 start ecosystem.staging.config.js
sleep 10
echo -e "${GREEN}✓ Staging services started${NC}"
echo ""

echo -e "${YELLOW}Step 6: Starting PRODUCTION services${NC}"
cd /home/ubuntu/outcraftly-production
pm2 start ecosystem.config.js
sleep 10
echo -e "${GREEN}✓ Production services started${NC}"
echo ""

echo -e "${YELLOW}Step 7: Saving PM2 configuration${NC}"
pm2 save
echo -e "${GREEN}✓ PM2 configuration saved${NC}"
echo ""

echo -e "${YELLOW}Step 8: Setting up PM2 startup script${NC}"
echo "Run the following command that PM2 suggests:"
pm2 startup
echo ""
echo "After running the suggested command, run: pm2 save"
echo ""

echo "========================================="
echo "Server Status:"
echo "========================================="
pm2 list
echo ""
free -h
echo ""

echo -e "${GREEN}========================================="
echo "✓ Setup Complete!"
echo "=========================================${NC}"
echo ""
echo "Test your domains:"
echo "  • https://staging.outcraftly.com"
echo "  • https://app.outcraftly.com"
echo ""
echo "Monitor with:"
echo "  • pm2 logs"
echo "  • pm2 monit"
echo "  • ~/cleanup-zombies.sh (if needed)"
echo ""
echo "Logs location:"
echo "  • ~/.pm2/logs/"
echo ""
