# Staging Deployment Guide

## 🎯 Root Cause Summary

**Problem**: Login/signup fails with Next.js digest error `3241377144`

**Root Cause**: PM2's `dotenv.config()` in `ecosystem.config.js` loads environment variables into PM2's process but **NOT** into the child Next.js process, causing `POSTGRES_URL` to be undefined at runtime.

**Evidence**:
- ✅ PM2 env shows `POSTGRES_URL=SET`
- ❌ Next.js runtime shows `POSTGRES_URL=undefined`
- ❌ Database connection fails → Auth fails → Digest error

---

## ✅ Primary Fix Applied

### 1. Updated `ecosystem.config.js`

**Key Change**: Added `env_file` parameter to propagate environment variables to the child process.

```javascript
module.exports = {
  apps: [{
    name: 'outcraftly-staging',
    script: 'pnpm',
    args: 'start',
    instances: 1,
    exec_mode: 'fork',
    env_file: '/home/ubuntu/outcraftly-staging/.env',  // ✅ PRIMARY FIX
    node_args: '--dns-result-order=ipv4first',          // ✅ Moved from NODE_OPTIONS
    // ... other config
  }]
};
```

**What this fixes**:
- PM2 now reads `.env` file
- Environment variables are set for the child process
- `pnpm start` → `next start` inherits env vars
- `process.env.POSTGRES_URL` is SET ✓
- Database connection succeeds ✓

---

## 🚀 Deployment Steps

### Step 1: Update Files on VPS

```bash
# From your local machine
scp -i ~/.ssh/id_ed25519 ecosystem.config.js ubuntu@155.133.26.49:/home/ubuntu/outcraftly-staging/

# Or push to git and pull on VPS
git push origin main
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49
cd /home/ubuntu/outcraftly-staging
git pull origin main
```

### Step 2: Restart PM2 with New Config

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49

cd /home/ubuntu/outcraftly-staging

# Backup current config (optional)
cp ecosystem.config.js ecosystem.config.js.backup

# Stop and remove current process
pm2 delete outcraftly-staging

# Start with new configuration
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Verify it started successfully
pm2 list
pm2 logs outcraftly-staging --lines 30
```

### Step 3: Verify Environment Variables are Loaded

```bash
# Check PM2 environment
pm2 env 0 | grep POSTGRES_URL

# Test the health endpoint
curl http://localhost:3000/api/health | jq .

# Expected output:
# {
#   "status": "healthy",
#   "database": "connected",
#   "postgresConfigured": true
# }
```

### Step 4: Test Login/Signup

```bash
# Test from browser
open https://staging.outcraftly.com/sign-in

# Or use curl
curl -X POST https://staging.outcraftly.com/sign-in \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'email=test@example.com&password=yourpassword'

# Expected: 302 redirect or success, NOT digest error
```

---

## 🛠️ Quick Commands

### Automated Deployment
Use the provided deployment script:

```bash
./deploy-staging.sh
```

### Quick Diagnostics
Run the diagnostic script to check system health:

```bash
./diagnose-staging.sh
```

### Manual Restart

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 \
  "cd /home/ubuntu/outcraftly-staging && pm2 restart outcraftly-staging --update-env"
```

### Check Logs

```bash
# Recent logs
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 \
  "pm2 logs outcraftly-staging --lines 50"

# Follow logs in real-time
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 \
  "pm2 logs outcraftly-staging"

# Error logs only
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 \
  "pm2 logs outcraftly-staging --err"
```

### Health Check

```bash
# Remote health check
curl https://staging.outcraftly.com/api/health | jq .

# Local health check (on VPS)
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 \
  "curl -s http://localhost:3000/api/health | jq ."
```

---

## 🧪 Validation Checklist

After deployment, verify:

- [ ] PM2 process is running: `pm2 list`
- [ ] Health endpoint returns `healthy`: `curl https://staging.outcraftly.com/api/health`
- [ ] `postgresConfigured: true` in health response
- [ ] Login works without digest errors
- [ ] Signup works without digest errors
- [ ] No ECONNREFUSED errors in logs
- [ ] Only one process listening on port 3000

---

## 🔍 Troubleshooting

### Issue: Still getting digest errors

1. **Check environment variables are loaded**:
   ```bash
   ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 env 0 | grep POSTGRES"
   ```

2. **Verify .env file exists and is readable**:
   ```bash
   ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "ls -la /home/ubuntu/outcraftly-staging/.env"
   ```

3. **Check health endpoint**:
   ```bash
   curl https://staging.outcraftly.com/api/health | jq .env
   ```
   
   If `postgresConfigured: false`, environment variables aren't loading.

### Issue: Health endpoint shows `postgresConfigured: false`

**Solution**: PM2 isn't loading the env file properly.

Try the alternative approach with inline env vars:

```javascript
// ecosystem.config.js
const dotenv = require('dotenv');
const envVars = dotenv.config({ path: '.env' }).parsed;

module.exports = {
  apps: [{
    name: 'outcraftly-staging',
    script: 'pnpm',
    args: 'start',
    env: envVars,  // Pass parsed vars directly
    // ... rest of config
  }]
};
```

### Issue: ECONNREFUSED errors

This means the database URL is still not reaching the Next.js runtime.

1. Check if `.env` has the correct path in `ecosystem.config.js`
2. Verify `.env` file permissions: `chmod 600 .env`
3. Try the alternative inline env approach above

### Issue: Memory issues (ELIFECYCLE 137)

Increase memory limit:

```javascript
// ecosystem.config.js
max_memory_restart: '1536M',  // Increased from 1G
```

---

## 📋 Environment Variables Required

The `.env` file on VPS should contain:

```bash
# Database (REQUIRED)
POSTGRES_URL=postgresql://user:pass@host:5432/db

# Auth (REQUIRED)
AUTH_SECRET=your-64-char-hex-secret
BASE_URL=https://staging.outcraftly.com

# Stripe (REQUIRED for payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (REQUIRED for email features)
SENDER_CREDENTIALS_KEY=...

# Workers (REQUIRED for sequences)
SEQUENCE_EVENTS_SECRET=...
SEQUENCE_WORKER_SECRET=...
REPLY_WORKER_SECRET=...

# Optional
MIN_SEND_INTERVAL_MINUTES=5
DEBUG_INBOUND=false
NODE_OPTIONS=--dns-result-order=ipv4first
```

---

## 🔒 Security Checklist

- [ ] `.env` file has restricted permissions: `chmod 600 .env`
- [ ] `.env` is in `.gitignore`
- [ ] SSH key has restricted permissions: `chmod 600 ~/.ssh/id_ed25519`
- [ ] Only necessary environment variables are exposed
- [ ] Database credentials are rotated periodically
- [ ] SSL certificates are valid and auto-renewing

---

## 📊 Monitoring

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Process info
pm2 info outcraftly-staging

# Memory usage
pm2 list
```

### Log Analysis

```bash
# Search for digest errors
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 \
  "grep -c 'digest' ~/.pm2/logs/outcraftly-staging-out*.log"

# Recent errors
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 \
  "tail -n 100 ~/.pm2/logs/outcraftly-staging-error*.log"
```

### Optional: PM2 Plus

For advanced monitoring, link to PM2 Plus:

```bash
pm2 link <secret> <public>  # Get from pm2.io
```

---

## 🎓 Key Learnings

1. **PM2 + dotenv gotcha**: `require("dotenv").config()` in `ecosystem.config.js` loads vars into PM2's process, NOT the child. Always use `env_file` or `env` block.

2. **Next.js production mode**: `next start` does NOT auto-load `.env*` files. Environment must be provided externally.

3. **Digest errors hide root causes**: Always add comprehensive logging at DB/auth boundaries.

4. **Database lazy loading**: Drizzle client initialization succeeds even with missing `POSTGRES_URL`, but fails on first query.

---

## 📞 Emergency Commands

### Force Restart Everything

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 << 'ENDSSH'
cd /home/ubuntu/outcraftly-staging
pm2 delete outcraftly-staging
pm2 start ecosystem.config.js
pm2 save
pm2 logs outcraftly-staging --lines 20
ENDSSH
```

### Rollback Config

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 \
  "cd /home/ubuntu/outcraftly-staging && cp ecosystem.config.js.backup ecosystem.config.js && pm2 restart outcraftly-staging"
```

### Full System Reboot

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "sudo reboot"
# Wait 2 minutes, then check
curl https://staging.outcraftly.com/api/health
```

---

## ✅ Success Criteria

Your deployment is successful when:

1. ✅ Health endpoint returns `"status": "healthy"`
2. ✅ Health endpoint shows `"postgresConfigured": true`
3. ✅ Login works without errors
4. ✅ Signup works without errors
5. ✅ No digest errors in logs
6. ✅ PM2 shows process as `online` with low restart count
7. ✅ Response times are under 100ms for health checks

---

## 📝 Post-Deployment

After successful deployment:

1. Document any issues encountered
2. Update this guide if needed
3. Monitor logs for 24 hours for any unusual patterns
4. Test all critical user flows (login, signup, dashboard access)
5. Verify email sending works (if applicable)
6. Test payment flows (if applicable)

---

## 🔗 Related Documentation

- [Next.js Environment Variables](https://nextjs.org/docs/pages/building-your-application/configuring/environment-variables)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/application-declaration/)
- [Drizzle ORM Connection](https://orm.drizzle.team/docs/get-started-postgresql)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)

---

**Last Updated**: 2025-11-28  
**Version**: 1.0  
**Maintained By**: DevOps Team
