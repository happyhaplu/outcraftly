# Staging Server Stability Fix

## Problem
The staging server at staging.outcraftly.com was failing after a few hours with "bad request" errors, requiring manual restarts via Coolify.

## Root Causes Identified

### 1. **Memory Leak from Database Connections**
- The postgres.js connection pool wasn't being monitored or recycled
- Idle timeout was too aggressive (5s), causing frequent reconnections
- No connection lifetime limit meant stale connections could accumulate

### 2. **IMAP/POP3 Connection Leaks**
- Reply detection worker could leave connections open on errors
- No explicit cleanup of POP3 client connections

### 3. **Memory Configuration Issues**
- `max_memory_restart: 800M` was too close to `max-old-space-size: 768M`
- Workers had only 512M limit, too low for long-running processes

### 4. **No Health Monitoring**
- No periodic checks for database connection health
- No visibility into connection pool exhaustion

## Fixes Applied

### 1. Database Connection Improvements (`lib/db/drizzle.ts`)
```javascript
// Increased idle timeout from 5s to 30s
idle_timeout: 30

// Added max_lifetime to recycle connections every hour
max_lifetime: 3600

// Added onnotice handler to suppress noise
onnotice: () => {}
```

### 2. Memory Limit Increases (`ecosystem.staging.config.js`)
```javascript
// Main app: 800M → 1024M
max_memory_restart: '1024M'
max_old_space_size: 896

// Worker: 512M → 768M + cron restart
max_memory_restart: '768M'
cron_restart: '0 */6 * * *'  // Restart every 6 hours
```

### 3. Connection Health Checks (`scripts/run-sequence-worker.ts`)
- Added periodic health check every 100 iterations
- Detects stale database connections early
- Fails fast if database becomes unhealthy

### 4. IMAP/POP3 Cleanup (`lib/workers/reply-detection-worker.ts`)
- Improved cleanup function to explicitly call `client.quit()`
- Wrapped in try-catch to handle cleanup errors gracefully

### 5. New Monitoring Tool (`scripts/monitor-connections.ts`)
Run `pnpm monitor` to check:
- Active vs idle database connections
- Long-running queries
- Connection leaks (idle in transaction)
- Memory usage
- Database size

## Deployment Instructions

### On Your VPS via Coolify:

1. **Pull the latest changes:**
   ```bash
   cd /home/ubuntu/outcraftly-staging
   git pull origin main
   pnpm install
   ```

2. **Set environment variables** (if not already set):
   ```bash
   # Optional - these use sensible defaults now
   POSTGRES_MAX_CONNECTIONS=10
   POSTGRES_IDLE_TIMEOUT=30
   POSTGRES_MAX_LIFETIME=3600
   POSTGRES_CONNECT_TIMEOUT=10
   ```

3. **Restart via Coolify** or manually:
   ```bash
   pm2 reload ecosystem.staging.config.js
   ```

4. **Monitor the system** (run this periodically):
   ```bash
   cd /home/ubuntu/outcraftly-staging
   pnpm monitor
   ```

### Expected Improvements:

✅ **No more crashes after a few hours** - Connection leaks fixed  
✅ **Better memory management** - Increased limits + auto-restart  
✅ **Proactive health checks** - Workers detect issues early  
✅ **Visibility** - Use `pnpm monitor` to diagnose issues  

### Monitoring Recommendations:

1. **Set up a cron job** to run the monitor script:
   ```bash
   # Add to crontab
   */30 * * * * cd /home/ubuntu/outcraftly-staging && pnpm monitor >> /tmp/staging-health.log 2>&1
   ```

2. **Check PM2 logs regularly:**
   ```bash
   pm2 logs staging-app --lines 100
   pm2 logs staging-worker --lines 100
   ```

3. **Watch for these patterns** in logs:
   - "Database connection health check failed" → Connection issues
   - "High heap usage" → Memory pressure
   - "POTENTIAL CONNECTION LEAKS" → Need investigation

### If Issues Persist:

1. **Check database connection limits:**
   ```sql
   SELECT max_conn FROM pg_settings WHERE name = 'max_connections';
   ```

2. **Increase POSTGRES_MAX_CONNECTIONS** if your database allows more

3. **Consider using PgBouncer** for connection pooling at the database level

4. **Enable detailed logging temporarily:**
   ```bash
   # In .env
   LOG_LEVEL=debug
   ```

## Files Changed:
- `ecosystem.staging.config.js` - Memory limits and cron restart
- `lib/db/drizzle.ts` - Connection pool configuration
- `scripts/run-sequence-worker.ts` - Health checks
- `lib/workers/reply-detection-worker.ts` - Connection cleanup
- `scripts/monitor-connections.ts` - New monitoring tool
- `package.json` - Added monitor script
