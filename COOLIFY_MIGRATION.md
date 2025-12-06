# Migration to Coolify - Complete Guide

## Why Coolify?

✅ **Automatic deployments** from GitHub (no GitHub Actions needed)
✅ **Built-in SSL/TLS** with Let's Encrypt
✅ **Zero-downtime deployments** 
✅ **Automatic health checks** and rollbacks
✅ **Environment variable management** via UI
✅ **Database backups** automated
✅ **Multiple environments** (staging, production) from one dashboard
✅ **Resource monitoring** built-in
✅ **No PM2/Nginx configuration** needed

## Prerequisites

- Ubuntu VPS with 11GB RAM ✅ (you have this)
- SSH access ✅ (you have this)
- Domain names pointing to your VPS ✅ (staging.outcraftly.com, app.outcraftly.com)

## Step 1: Install Coolify on VPS

### Option A: One-Line Installation (Recommended)

SSH into your VPS and run:

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49

# Install Coolify (official installer)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

This will:
- Install Docker (if not present)
- Install Coolify
- Start Coolify on port 8000

### Option B: Using Our Custom Script

From your local machine:

```bash
# Upload and run our script
scp -i ~/.ssh/id_ed25519 scripts/install-coolify.sh ubuntu@155.133.26.49:/tmp/
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "sudo bash /tmp/install-coolify.sh"
```

## Step 2: Initial Coolify Setup

1. **Access Coolify Dashboard**
   - Open browser: `http://155.133.26.49:8000`
   - Or use tunnel: `ssh -i ~/.ssh/id_ed25519 -L 8000:localhost:8000 ubuntu@155.133.26.49`
   - Then visit: `http://localhost:8000`

2. **Create Admin Account**
   - Set up your email and password
   - This will be your Coolify admin account

3. **Optional: Set Up Custom Domain for Coolify**
   - Point subdomain: `coolify.outcraftly.com` → `155.133.26.49`
   - In Coolify: Settings → Instance Settings → Domain
   - Enable SSL with Let's Encrypt

## Step 3: Connect GitHub Repository

1. **Add Source**
   - Go to: Sources → Add Source
   - Select: GitHub
   - Click: Authorize with GitHub
   - Select your organization: `happyhaplu`

2. **Create Project**
   - Projects → New Project
   - Name: `Outcraftly`

3. **Add Staging Environment**
   - Inside project → New Environment
   - Name: `staging`

4. **Add Production Environment**
   - Inside project → New Environment
   - Name: `production`

## Step 4: Configure Staging Application

1. **Create New Resource in Staging Environment**
   - Type: `Application`
   - Source: `happyhaplu/outcraftly`
   - Branch: `main`
   - Build Pack: `nixpacks` (auto-detects Next.js)

2. **Domain Configuration**
   - Domain: `staging.outcraftly.com`
   - Enable: `Generate Let's Encrypt Certificate`

3. **Environment Variables**
   Copy all your existing secrets:
   ```
   AUTH_SECRET=***
   BASE_URL=https://staging.outcraftly.com
   DEBUG_INBOUND=***
   MIN_SEND_INTERVAL_MINUTES=***
   POSTGRES_URL=***
   REPLY_WORKER_SECRET=***
   SENDER_CREDENTIALS_KEY=***
   SEQUENCE_EVENTS_SECRET=***
   SEQUENCE_WORKER_SECRET=***
   STRIPE_SECRET_KEY=***
   STRIPE_WEBHOOK_SECRET=***
   ```

4. **Build Configuration**
   - Build Command: `pnpm build`
   - Start Command: `pnpm start`
   - Port: `3000`

5. **Deploy**
   - Click: `Deploy`
   - Wait for build and deployment
   - Coolify will automatically set up SSL and health checks

## Step 5: Configure Production Application

Repeat Step 4 but with:
- Branch: `release`
- Domain: `app.outcraftly.com`
- Manual deployment approval (optional)

## Step 6: Database Setup (Optional)

If you want to migrate your PostgreSQL to Coolify:

1. **Create Database in Coolify**
   - Resources → New Database → PostgreSQL
   - Set version: `16` (or your current version)
   - Set password

2. **Backup Current Database**
   ```bash
   ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49
   pg_dump "YOUR_CURRENT_DB_URL" > /tmp/outcraftly_backup.sql
   ```

3. **Import to Coolify DB**
   - Get new database URL from Coolify
   - Import backup:
   ```bash
   psql "NEW_COOLIFY_DB_URL" < /tmp/outcraftly_backup.sql
   ```

4. **Update POSTGRES_URL** in both environments

## Step 7: Migration Cutover

### Preparation
1. **Test staging thoroughly** in Coolify
2. **Verify all environment variables** are set
3. **Check database connectivity**
4. **Test a deployment** from GitHub

### Cutover Steps

1. **Stop Old PM2 Services**
   ```bash
   ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49
   pm2 delete all
   pm2 save
   ```

2. **Deploy Production in Coolify**
   - Coolify will take over ports 80/443
   - Automatic SSL setup
   - Automatic health checks

3. **DNS Already Points to Same IP**
   - No DNS changes needed!
   - Coolify uses same IP: `155.133.26.49`

4. **Monitor First Deployment**
   - Watch Coolify logs in real-time
   - Check health status
   - Test both domains

## Step 8: Cleanup Old Setup (After Successful Migration)

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49

# Remove PM2
pm2 unstartup
npm uninstall -g pm2

# Optional: Remove old directories (keep backups!)
# mv /home/ubuntu/outcraftly-staging /home/ubuntu/backup-staging
# mv /home/ubuntu/outcraftly-production /home/ubuntu/backup-production

# Keep Nginx for now (Coolify might use it as reverse proxy)
# Or let Coolify manage its own Traefik reverse proxy
```

## Step 9: Update GitHub Actions (Optional)

Since Coolify handles deployments automatically via webhooks, you can:

1. **Disable the deploy.yml workflow**
   - Rename: `.github/workflows/deploy.yml.disabled`
   - Or delete it

2. **Keep CI jobs only**
   - Create `.github/workflows/ci.yml` for linting/testing
   - Remove deployment steps

## Benefits After Migration

### Before (Current Setup)
- ❌ Manual PM2 configuration
- ❌ Manual Nginx setup
- ❌ Manual SSL certificate renewal
- ❌ GitHub Actions complexity
- ❌ Manual environment variable management
- ❌ Manual health checks
- ❌ Zombie process issues

### After (Coolify)
- ✅ Automatic deployments on git push
- ✅ Built-in SSL with auto-renewal
- ✅ Web UI for environment variables
- ✅ Automatic health checks and rollbacks
- ✅ Zero-downtime deployments
- ✅ Built-in monitoring and logs
- ✅ One-click rollbacks
- ✅ Database backups automated

## Coolify Features You'll Use

1. **Automatic Deployments**
   - Push to `main` → Auto-deploy to staging
   - Push to `release` → Auto-deploy to production
   - Or enable manual approval for production

2. **Environment Variables**
   - Manage all secrets via UI
   - Encrypted storage
   - Per-environment configuration

3. **Monitoring**
   - Real-time logs
   - Resource usage graphs
   - Deployment history

4. **Backups**
   - Scheduled database backups
   - One-click restore
   - S3/storage integration

5. **Team Collaboration**
   - Multiple users
   - Role-based access
   - Audit logs

## Troubleshooting

### Port 8000 Already in Use
```bash
# Check what's using port 8000
sudo lsof -i :8000
sudo kill -9 <PID>
```

### Can't Access Coolify UI
```bash
# Check if Coolify is running
docker ps | grep coolify

# Restart Coolify
docker restart coolify

# Check logs
docker logs coolify
```

### Deployment Fails
- Check build logs in Coolify UI
- Verify environment variables are set
- Check if database is accessible
- Verify domain DNS records

### SSL Certificate Issues
- Ensure DNS points to correct IP
- Wait 5-10 minutes after DNS change
- Check Coolify logs for Let's Encrypt errors

## Cost Comparison

### Current Setup (GitHub Actions + PM2)
- Manual management time: ~2-4 hours/month
- GitHub Actions minutes: Free tier (but limited)
- Complexity: High

### Coolify
- Management time: ~15 minutes/month
- Cost: Free (self-hosted)
- Complexity: Low

## Migration Timeline

- **Installation**: 10-15 minutes
- **Setup & Configuration**: 30-45 minutes
- **Testing**: 1-2 hours
- **Production Cutover**: 15-30 minutes
- **Total**: ~2-3 hours

## Support & Resources

- Coolify Docs: https://coolify.io/docs
- Coolify Discord: https://discord.gg/coolify
- GitHub: https://github.com/coollabsio/coolify

## Quick Start Commands

```bash
# 1. Install Coolify
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash

# 2. Access UI (via SSH tunnel)
ssh -i ~/.ssh/id_ed25519 -L 8000:localhost:8000 ubuntu@155.133.26.49
# Then open: http://localhost:8000

# 3. After setup, stop old services
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49
pm2 delete all

# 4. Done! Coolify takes over
```

## Next Steps

1. ✅ Install Coolify (Step 1)
2. ✅ Create admin account (Step 2)
3. ✅ Connect GitHub (Step 3)
4. ✅ Deploy staging (Step 4)
5. ✅ Test thoroughly
6. ✅ Deploy production (Step 5)
7. ✅ Cleanup old setup (Step 8)

---

**Ready to migrate?** Start with Step 1 above!
