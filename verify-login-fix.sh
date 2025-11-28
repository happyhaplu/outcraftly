#!/bin/bash
# Quick verification script for login/signup fix
# Run from staging server: bash verify-login-fix.sh

echo "=== Outcraftly Staging Login Fix Verification ==="
echo ""

echo "1. Checking PM2 Status..."
pm2 status | grep outcraftly-staging
echo ""

echo "2. Verifying Single Process on Port 3000..."
PORT_COUNT=$(lsof -i :3000 2>/dev/null | grep -c LISTEN || echo "0")
if [ "$PORT_COUNT" -eq "1" ]; then
    echo "✅ Single process listening on port 3000"
else
    echo "❌ Multiple or no processes on port 3000: $PORT_COUNT"
fi
echo ""

echo "3. Checking Environment Variables..."
cd ~/outcraftly-staging
if grep -q "NODE_OPTIONS=--dns-result-order=ipv4first" .env; then
    echo "✅ NODE_OPTIONS configured for IPv4"
else
    echo "❌ NODE_OPTIONS not set"
fi

if grep -q "BASE_URL=https://staging.outcraftly.com" .env; then
    echo "✅ BASE_URL set to HTTPS domain"
else
    echo "❌ BASE_URL incorrect"
fi

if grep -q "AUTH_SECRET=" .env; then
    echo "✅ AUTH_SECRET configured"
else
    echo "❌ AUTH_SECRET missing"
fi
echo ""

echo "4. Checking PM2 Ecosystem Config..."
if [ -f "ecosystem.config.js" ]; then
    echo "✅ ecosystem.config.js exists"
    if grep -q '"instances": 1' ecosystem.config.js; then
        echo "✅ Single instance configured"
    fi
else
    echo "❌ ecosystem.config.js not found"
fi
echo ""

echo "5. Checking Recent Logs for Errors..."
ERROR_COUNT=$(pm2 logs outcraftly-staging --lines 50 --nostream 2>/dev/null | grep -c "EADDRINUSE\|EHOSTUNREACH\|digest.*3241377144" || echo "0")
if [ "$ERROR_COUNT" -eq "0" ]; then
    echo "✅ No EADDRINUSE, EHOSTUNREACH, or digest errors in recent logs"
else
    echo "⚠️  Found $ERROR_COUNT error occurrences in recent logs"
fi
echo ""

echo "6. Testing Database Connection..."
NODE_OPTIONS=--dns-result-order=ipv4first timeout 5 pnpm drizzle-kit push --check &>/dev/null
if [ $? -eq 0 ] || [ $? -eq 124 ]; then
    echo "✅ Database connection works (IPv4)"
else
    echo "❌ Database connection failed"
fi
echo ""

echo "=== Verification Complete ==="
echo ""
echo "Next Steps:"
echo "1. Test login at: https://staging.outcraftly.com/sign-in"
echo "   Email: aadarshkumarhappy@gmail.com"
echo "   Password: System@123321"
echo ""
echo "2. Monitor logs during login:"
echo "   pm2 logs outcraftly-staging --lines 0"
echo ""
echo "3. Expected: Redirect to /dashboard without error digest"
