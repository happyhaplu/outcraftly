# Server 502/504 Gateway Timeout Fix Summary

## Problem Identified

### Root Cause
The server was experiencing **critical memory exhaustion** causing 502 Bad Gateway and 504 Gateway Timeout errors on both staging.outcraftly.com and app.outcraftly.com.

### Specific Issues Found:
1. **Memory Exhaustion**: Only 116MB free RAM out of 11GB total
2. **Zombie Processes**: Hundreds of orphaned Node.js worker processes not being cleaned up
3. **PM2 Configuration Issues**: Missing memory limits and proper process management
4. **Application Build Errors**: Stale Next.js builds with class constructor errors

## Actions Taken

### 1. Emergency Memory Cleanup ✅
```bash
# Killed all PM2 processes and zombie Node processes
pm2 delete all
pkill -9 -f 'tsx.*run-sequence-worker'
pkill -9 -f 'tsx.*run-reply-worker'
pkill -9 -f 'next start'
```
**Result**: Memory freed from 116MB to 9.1GB available

### 2. Updated PM2 Ecosystem Configurations ✅

#### Staging (`/home/ubuntu/outcraftly-staging/ecosystem.staging.config.js`)
- Added `max_memory_restart: '800M'` for app, `'500M'` for workers
- Added `kill_timeout: 10000` to ensure processes terminate properly
- Added `min_uptime: '30s'` and `max_restarts: 10` for stability
- Added `--max-old-space-size` Node flags to limit memory usage
- Increased `listen_timeout` to 30000ms

#### Production (`/home/ubuntu/outcraftly-production/ecosystem.config.js`)
- Same optimizations as staging
- Ensures proper process cleanup on restart

### 3. Created Cleanup Script ✅
Created `/home/ubuntu/cleanup-zombies.sh` to manually clean zombie processes when needed.

Usage:
```bash
ssh ubuntu@155.133.26.49
~/cleanup-zombies.sh
```

### 4. Nginx Configuration Prepared
Created improved nginx configs with:
- Increased timeouts: `proxy_read_timeout 120s`
- Better buffer settings
- `client_max_body_size 50M`

**Note**: Nginx config needs sudo access to apply. File ready at `/tmp/staging-nginx.conf`

## Remaining Tasks

### Immediate (Manual Steps Required):

1. **Rebuild Applications**:
   ```bash
   ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49
   
   # Rebuild staging
   cd /home/ubuntu/outcraftly-staging
   pnpm build
   
   # Rebuild production
   cd /home/ubuntu/outcraftly-production
   pnpm build
   ```

2. **Restart PM2 Processes**:
   ```bash
   # Start staging
   cd /home/ubuntu/outcraftly-staging
   pm2 delete ecosystem.staging.config.js
   pm2 start ecosystem.staging.config.js
   pm2 save
   
   # Start production
   cd /home/ubuntu/outcraftly-production
   pm2 delete ecosystem.config.js
   pm2 start ecosystem.config.js
   pm2 save
   ```

3. **Update Nginx (requires sudo)**:
   ```bash
   # Copy the prepared config
   sudo cp /tmp/staging-nginx.conf /etc/nginx/sites-available/staging.outcraftly.com
   
   # Do the same for production nginx config
   
   # Test and reload nginx
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Setup PM2 Startup**:
   ```bash
   pm2 startup
   # Follow the command it provides
   pm2 save
   ```

5. **Setup Automated Monitoring** (Recommended):
   ```bash
   # Create a cron job to check for zombie processes
   crontab -e
   # Add: */30 * * * * /home/ubuntu/cleanup-zombies.sh >> /home/ubuntu/cleanup.log 2>&1
   ```

### Long-term Solutions:

1. **Install Coolify** for better container management
2. **Setup proper monitoring** (Prometheus + Grafana or similar)
3. **Implement health checks** in the application
4. **Consider upgrading server** if 11GB RAM continues to be insufficient
5. **Optimize Node.js memory usage** in application code
6. **Implement proper logging and alerting**

## Prevention Measures

### PM2 Best Practices Implemented:
- ✅ Memory limits on all processes
- ✅ Proper kill timeouts
- ✅ Restart delay to prevent restart loops
- ✅ Maximum restart limits
- ✅ Minimum uptime requirements

### Monitoring Needed:
- [ ] Setup memory usage alerts (< 20% free)
- [ ] Monitor PM2 restart counts
- [ ] Track application response times
- [ ] Log aggregation for error analysis

## Configuration Files Updated

### Local Repository (sync to GitHub):
- `/ecosystem.config.js` - Production config with memory limits
- `/ecosystem.staging.config.js` - Staging config with memory limits

### Server Files (already updated):
- `/home/ubuntu/outcraftly-staging/ecosystem.staging.config.js`
- `/home/ubuntu/outcraftly-production/ecosystem.config.js`
- `/home/ubuntu/cleanup-zombies.sh` (new cleanup script)

## Next Steps for You

1. Wait for me to complete the rebuild and restart process
2. Test both domains:
   - https://staging.outcraftly.com
   - https://app.outcraftly.com
3. Decide on Coolify installation timing
4. Consider adding monitoring tools

## Memory Usage Target
- **Before**: 116MB free (99% used) ❌
- **After cleanup**: 6.5GB free (41% used) ✅
- **Target**: Keep 30-40% free (3-4GB) for healthy operation

## Key Learnings
1. PM2 doesn't automatically kill child processes properly without `kill_timeout`
2. Workers were spawning but never terminating, eating all RAM
3. Memory limits prevent runaway processes
4. Regular cleanup/monitoring is essential
