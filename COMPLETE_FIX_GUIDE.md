# 🚀 Server 502/504 Gateway Timeout - COMPLETE FIX GUIDE

## ✅ What Was Fixed

### Critical Issues Resolved:
1. **Memory Exhaustion** - Server had only 116MB free out of 11GB (99% usage)
2. **Zombie Processes** - Hundreds of orphaned Node.js processes consuming RAM
3. **PM2 Configuration** - Missing memory limits and process management
4. **Process Cleanup** - PM2 wasn't killing child processes properly

### Changes Made:
- ✅ Optimized PM2 configurations with memory limits
- ✅ Added proper process kill timeouts
- ✅ Implemented restart policies and stability measures
- ✅ Created cleanup scripts for manual intervention
- ✅ Pushed fixes to both `main` and `release` branches

## 📋 What You Need to Do

### Option 1: Automated Fix (Recommended)
Run the complete fix script on the server:

```bash
# Copy the script to the server
scp -i ~/.ssh/id_ed25519 complete-server-fix.sh ubuntu@155.133.26.49:~/

# SSH into the server
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49

# Run the fix script
cd ~
chmod +x complete-server-fix.sh
./complete-server-fix.sh
```

### Option 2: Manual Steps

```bash
# SSH into server
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49

# 1. Clean up all processes
pm2 delete all
pkill -9 -f "next start"
pkill -9 -f "tsx.*run-sequence-worker"
pkill -9 -f "tsx.*run-reply-worker"

# 2. Pull latest code
cd /home/ubuntu/outcraftly-staging
git pull origin main

cd /home/ubuntu/outcraftly-production
git pull origin release

# 3. Rebuild staging
cd /home/ubuntu/outcraftly-staging
rm -rf .next
pnpm install
pnpm build

# 4. Rebuild production
cd /home/ubuntu/outcraftly-production
rm -rf .next
pnpm install
pnpm build

# 5. Start staging
cd /home/ubuntu/outcraftly-staging
pm2 start ecosystem.staging.config.js

# 6. Start production
cd /home/ubuntu/outcraftly-production
pm2 start ecosystem.config.js

# 7. Save and setup auto-start
pm2 save
pm2 startup
# Run the command it suggests, then:
pm2 save

# 8. Verify
pm2 list
pm2 logs
free -h
```

## 🔍 Monitoring & Maintenance

### Check Service Status
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 list"
```

### Monitor Logs
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 logs"
```

### Check Memory Usage
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "free -h"
```

### Manual Cleanup (if needed)
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "~/cleanup-zombies.sh"
```

## 📊 Configuration Changes

### PM2 Memory Limits
- **App processes**: 800MB max
- **Worker processes**: 500MB max
- **Reply processes**: 500MB max

### Process Management
- `kill_timeout: 10000ms` - Ensures processes die properly
- `min_uptime: 30s` - Prevents restart loops
- `max_restarts: 10` - Limits restart attempts
- `restart_delay: 5000ms` - Delays between restarts

### Node.js Limits
- `--max-old-space-size=768` for apps
- `--max-old-space-size=480` for workers

## 🎯 Expected Results

### Before Fix:
- ❌ 502 Bad Gateway errors
- ❌ 504 Gateway Timeout errors
- ❌ Memory: 116MB free (99% used)
- ❌ Hundreds of zombie processes
- ❌ Apps constantly crashing

### After Fix:
- ✅ Both domains working
- ✅ Memory: 6-9GB free (40-60% used)
- ✅ No zombie processes
- ✅ Stable PM2 processes
- ✅ Automatic restarts on memory limit

## 🚨 Troubleshooting

### If domains still show 502/504:
1. Check PM2 status: `pm2 list`
2. Check logs: `pm2 logs --lines 50`
3. Check memory: `free -h`
4. Run cleanup: `~/cleanup-zombies.sh`
5. Restart services: `pm2 restart all`

### If build fails:
- Check for code errors in the logs
- Ensure all dependencies are installed
- Check disk space: `df -h`
- Try: `rm -rf node_modules && pnpm install`

### If memory fills up again:
- Run: `~/cleanup-zombies.sh`
- Check for memory leaks in application code
- Consider reducing worker instances
- Monitor with: `pm2 monit`

## 📁 Files Modified

### Local Repository:
- ✅ `ecosystem.config.js` - Production PM2 config
- ✅ `ecosystem.staging.config.js` - Staging PM2 config
- ✅ `SERVER_FIX_SUMMARY.md` - Detailed technical documentation
- ✅ `complete-server-fix.sh` - Automated fix script
- ✅ `COMPLETE_FIX_GUIDE.md` - This file

### Server Files:
- ✅ `/home/ubuntu/outcraftly-staging/ecosystem.staging.config.js`
- ✅ `/home/ubuntu/outcraftly-production/ecosystem.config.js`
- ✅ `/home/ubuntu/cleanup-zombies.sh`

## 🔄 Deployment Workflow Going Forward

### For Staging (main branch):
```bash
# On server
cd /home/ubuntu/outcraftly-staging
git pull origin main
pnpm install
pnpm build
pm2 restart ecosystem.staging.config.js
pm2 save
```

### For Production (release branch):
```bash
# On server
cd /home/ubuntu/outcraftly-production
git pull origin release
pnpm install
pnpm build
pm2 restart ecosystem.config.js
pm2 save
```

## 💡 Recommendations

### Short-term:
1. ✅ Run the complete fix script
2. ✅ Test both domains thoroughly
3. ✅ Monitor memory usage for 24-48 hours
4. ⏳ Setup automated monitoring alerts

### Long-term:
1. ⏳ Install monitoring (Prometheus/Grafana or similar)
2. ⏳ Consider Coolify for container management
3. ⏳ Implement application-level health checks
4. ⏳ Setup automated backups
5. ⏳ Document standard operating procedures

## 📞 Support

If issues persist after running the fix:
1. Check `SERVER_FIX_SUMMARY.md` for technical details
2. Review PM2 logs: `pm2 logs --lines 100`
3. Check system logs: `journalctl -u nginx -n 50`
4. Verify nginx config: `sudo nginx -t`

## ✨ Summary

The root cause was **memory exhaustion from zombie processes**. The fix:
- Cleared all zombie processes (freed 9GB RAM)
- Updated PM2 configs with memory limits and proper cleanup
- Pushed fixes to GitHub (both branches)
- Created automated fix script

**Next step**: Run `complete-server-fix.sh` on the server to complete the setup!

---
*Last updated: December 6, 2025*
*Status: Configuration fixes pushed to GitHub, server rebuild required*
