+# ✅ Staging Deployment Checklist

Use this checklist when deploying fixes to the staging VPS.

---

## Pre-Deployment

- [ ] All changes committed to git
- [ ] Code reviewed and tested locally
- [ ] Dependencies updated in `package.json` if needed
- [ ] `.env.example` updated with new variables (if any)
- [ ] Build succeeds locally: `pnpm build`

---

## Deployment Steps

### 1. Backup Current State
- [ ] SSH into VPS: `ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49`
- [ ] Backup current ecosystem config: `cp ecosystem.config.js ecosystem.config.js.backup`
- [ ] Note current PM2 status: `pm2 list`
- [ ] Check current logs: `pm2 logs --lines 20 --nostream`

### 2. Update Files
- [ ] Push changes to git: `git push origin main`
- [ ] Pull on VPS: `cd /home/ubuntu/outcraftly-staging && git pull origin main`
- [ ] Or use deployment script: `./deploy-staging.sh`

### 3. Update Dependencies & Build
- [ ] Install dependencies: `pnpm install --frozen-lockfile`
- [ ] Build application: `pnpm build`
- [ ] Verify build succeeded (check output)

### 4. Update PM2 Configuration
- [ ] Verify `ecosystem.config.js` has `env_file` parameter
- [ ] Check `.env` file exists: `ls -la .env`
- [ ] Verify `.env` has all required variables (see below)

### 5. Restart Application
- [ ] Stop current PM2 process: `pm2 delete outcraftly-staging`
- [ ] Start with new config: `pm2 start ecosystem.config.js`
- [ ] Save PM2 state: `pm2 save`
- [ ] Wait 5 seconds for app to start

### 6. Verify Deployment
- [ ] PM2 process is `online`: `pm2 list`
- [ ] Health endpoint responds: `curl http://localhost:3000/api/health | jq .`
- [ ] Health shows `"status": "healthy"`
- [ ] Health shows `"database": "connected"`
- [ ] Health shows `"postgresConfigured": true`
- [ ] Only one process on port 3000: `ss -tlnp | grep :3000`

### 7. Test Application
- [ ] Public health check: `curl https://staging.outcraftly.com/api/health`
- [ ] Login page loads: `curl -I https://staging.outcraftly.com/sign-in`
- [ ] Test login with real account (browser)
- [ ] Test signup with new account (browser)
- [ ] Check dashboard loads
- [ ] No digest errors in logs: `pm2 logs --lines 50 --nostream | grep digest`

---

## Environment Variables Required

Verify `.env` on VPS contains these variables:

### Critical (Application won't work without these)
- [ ] `POSTGRES_URL` - Database connection string
- [ ] `AUTH_SECRET` - 64-character hex string for auth
- [ ] `BASE_URL` - `https://staging.outcraftly.com`

### Required for Features
- [ ] `STRIPE_SECRET_KEY` - For payments
- [ ] `STRIPE_WEBHOOK_SECRET` - For Stripe webhooks
- [ ] `SENDER_CREDENTIALS_KEY` - For email sending
- [ ] `SEQUENCE_EVENTS_SECRET` - For sequence events
- [ ] `SEQUENCE_WORKER_SECRET` - For sequence worker
- [ ] `REPLY_WORKER_SECRET` - For reply worker

### Optional
- [ ] `MIN_SEND_INTERVAL_MINUTES` - Default: 5
- [ ] `DEBUG_INBOUND` - Default: false
- [ ] `DATABASE_URL` - Alias for POSTGRES_URL (optional)

---

## Post-Deployment Monitoring

### First 15 Minutes
- [ ] Monitor logs: `pm2 logs outcraftly-staging`
- [ ] Watch for errors or warnings
- [ ] Check memory usage: `pm2 monit`
- [ ] Verify restart count stays at 0

### First Hour
- [ ] Check logs every 15 minutes
- [ ] Test login/signup flows multiple times
- [ ] Monitor error rates
- [ ] Check response times in health endpoint

### First 24 Hours
- [ ] Review logs twice: morning and evening
- [ ] Check for any digest errors: `grep -c 'digest' ~/.pm2/logs/outcraftly-staging-*.log`
- [ ] Monitor restart count in PM2
- [ ] Verify memory usage is stable

---

## Rollback Procedure (If Something Goes Wrong)

1. **Stop current process**
   ```bash
   pm2 delete outcraftly-staging
   ```

2. **Restore backup config**
   ```bash
   cp ecosystem.config.js.backup ecosystem.config.js
   ```

3. **Revert code (if needed)**
   ```bash
   git reset --hard HEAD~1  # Go back one commit
   pnpm install
   pnpm build
   ```

4. **Restart with old config**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   ```

5. **Verify rollback succeeded**
   ```bash
   pm2 list
   curl http://localhost:3000/api/health
   ```

---

## Common Issues & Solutions

### Issue: PM2 shows "errored" status
**Solution**: Check logs for error details
```bash
pm2 logs outcraftly-staging --err --lines 50
```

### Issue: Health endpoint returns 503
**Solution**: Database not connected, check env vars
```bash
pm2 env 0 | grep POSTGRES_URL
```

### Issue: Port 3000 already in use
**Solution**: Kill duplicate processes
```bash
pm2 delete all
# Then restart properly
pm2 start ecosystem.config.js
```

### Issue: Still getting digest errors after fix
**Solution**: Verify env_file is correct
```bash
# Check ecosystem.config.js has correct path
cat ecosystem.config.js | grep env_file
# Should show: env_file: '/home/ubuntu/outcraftly-staging/.env'

# Verify .env exists and is readable
ls -la /home/ubuntu/outcraftly-staging/.env
```

### Issue: Build fails
**Solution**: Check Node version and dependencies
```bash
node --version  # Should be 18.x or 20.x
pnpm --version
rm -rf node_modules .next
pnpm install
pnpm build
```

---

## Success Criteria

Deployment is successful when ALL of these are true:

✅ **PM2 Status**
- Process state: `online`
- Restart count: `0` or very low
- Uptime: Increasing
- Memory: Under 800MB

✅ **Health Endpoint**
- Status: `"healthy"`
- Database: `"connected"`
- Response time: Under 100ms
- `postgresConfigured`: `true`

✅ **Application**
- Login works without errors
- Signup works without errors
- Dashboard loads correctly
- No digest errors in browser console
- No ECONNREFUSED in logs

✅ **Logs**
- No error messages
- Shows "✓ Ready in Xms"
- Database queries succeed
- No uncaught exceptions

---

## Emergency Contacts

If you encounter issues you can't resolve:

1. **Check Documentation**
   - `STAGING_DEPLOYMENT_GUIDE.md` - Full deployment guide
   - `QUICK_REFERENCE.md` - Quick commands
   - This checklist

2. **Run Diagnostics**
   ```bash
   ./diagnose-staging.sh
   ```

3. **Gather Debug Info**
   - PM2 status: `pm2 list`
   - Recent logs: `pm2 logs --lines 100 --nostream`
   - Health check: `curl https://staging.outcraftly.com/api/health`
   - Environment: `pm2 env 0 | grep -E 'POSTGRES|AUTH|BASE'` (redact sensitive values)

4. **Document the Issue**
   - What were you doing when it failed?
   - What error messages did you see?
   - What have you tried so far?
   - Include relevant log snippets

---

## Final Notes

- Always test in staging before production
- Keep this checklist updated with any new steps
- Document any issues and their solutions
- Review logs regularly for early warning signs
- Monitor memory and CPU usage trends

---

**Checklist Version**: 1.0  
**Last Updated**: 2025-11-28  
**For Project**: outcraftly-staging
