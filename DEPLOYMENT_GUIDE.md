# GitHub Actions Deployment Setup

## Required GitHub Secrets

Go to your repository settings: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

### 1. SERVER_SSH_KEY
Your SSH private key for server access:
```bash
# Copy your existing SSH key
cat ~/.ssh/id_ed25519
```
Copy the entire output (including `-----BEGIN` and `-----END` lines) and paste as secret value.

### 2. SERVER_IP
Your server IP address:
```
155.133.26.49
```

## Setup GitHub Environments (REQUIRED for Manual Approval)

### 1. Create Staging Environment
1. Go to `Settings` → `Environments` → `New environment`
2. Name: `staging`
3. Environment URL: `https://staging.outcraftly.com`
4. **No protection rules needed** (auto-deploy)
5. Click `Configure environment` → `Save protection rules`

### 2. Create Production Environment (WITH MANUAL APPROVAL)
1. Go to `Settings` → `Environments` → `New environment`
2. Name: `production`
3. Environment URL: `https://app.outcraftly.com`
4. **Enable "Required reviewers"**:
   - Click checkbox for "Required reviewers"
   - Add yourself (or team members) as reviewers
   - Set "Prevent self-review" if you want (optional)
5. Optional: Add "Wait timer" (e.g., 5 minutes minimum wait before deployment)
6. Click `Save protection rules`

## Deployment Workflow

### Automatic Staging Deployment
```bash
# 1. Make changes on your local machine
git add .
git commit -m "feat: new feature"
git push origin main

# 2. GitHub Actions automatically:
#    ✅ Builds the application
#    ✅ Deploys to staging.outcraftly.com
#    ✅ Verifies health check
```

### Manual Production Deployment (After Testing Staging)
```bash
# 1. Test staging thoroughly at https://staging.outcraftly.com
# 2. When satisfied, merge to release:

git checkout release
git merge main
git push origin release

# 3. GitHub Actions will:
#    ⏸️  PAUSE and wait for your approval
#    📧 Send notification to reviewers
#    
# 4. Go to GitHub Actions tab:
#    - Click on the running workflow
#    - You'll see "Review deployments" button
#    - Click "Review pending deployments"
#    - Check "production" environment
#    - Click "Approve and deploy"
#
# 5. After approval, it automatically:
#    ✅ Creates database backup
#    ✅ Deploys to app.outcraftly.com
#    ✅ Verifies health check
#    ⚠️  Rolls back on failure
```

## Manual Approval Screenshot Location

When a production deployment is triggered, you'll see:

```
GitHub Repository → Actions Tab → Running Workflow → 
"Review pending deployments" button (yellow/orange banner)
```

Click that button to approve!

## Emergency Rollback

If deployment fails, automatic rollback happens. For manual rollback:

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49

# For production:
cd /home/ubuntu/outcraftly-production
git reset --hard HEAD~1
pm2 restart all

# For staging:
cd /home/ubuntu/outcraftly-staging
git reset --hard HEAD~1
pm2 restart all
```

## Database Backup Location

Automatic backups are stored on the server:
```bash
/home/ubuntu/backups/db_backup_YYYYMMDD_HHMMSS.sql.gz
```

Last 7 backups are kept automatically.

## Monitoring Deployments

### View Logs
```bash
# Staging
ssh ubuntu@155.133.26.49 'pm2 logs staging-app --lines 100'

# Production
ssh ubuntu@155.133.26.49 'pm2 logs outcraftly-app --lines 100'
```

### Check Status
```bash
ssh ubuntu@155.133.26.49 'pm2 list'
```

## Troubleshooting

### Deployment Fails with SSH Error
- Verify `SERVER_SSH_KEY` secret contains the correct private key
- Ensure server IP `155.133.26.49` is correct in `SERVER_IP` secret

### Staging Deploys but Production Doesn't
- Make sure you created the `production` environment in GitHub settings
- Verify you added yourself as a required reviewer

### Health Check Fails
- Check if applications started: `ssh ubuntu@155.133.26.49 'pm2 list'`
- View logs: `pm2 logs <app-name>`
- Verify nginx is running: `sudo systemctl status nginx`

### Manual Approval Not Showing
- Ensure production environment has "Required reviewers" enabled
- Check that you're listed as a reviewer
- Refresh the Actions page

## Quick Reference

| Action | Command |
|--------|---------|
| Deploy to staging | `git push origin main` |
| Deploy to production | `git push origin release` (after merging main) |
| View staging | https://staging.outcraftly.com |
| View production | https://app.outcraftly.com |
| Check deployment status | GitHub Actions tab |
| Approve production | Click "Review deployments" button |
| View server logs | `ssh ubuntu@155.133.26.49 'pm2 logs'` |
| Emergency stop | `ssh ubuntu@155.133.26.49 'pm2 stop all'` |

## Best Practices

1. **Always test on staging first** before merging to release
2. **Review the diff** before approving production deployment
3. **Monitor logs** immediately after deployment
4. **Keep backups** - they're created automatically but verify they exist
5. **Use descriptive commit messages** so you know what's being deployed
6. **Deploy during low-traffic periods** when possible
7. **Have a rollback plan** ready before each production deployment

## Next Steps

1. Add the two secrets (`SERVER_SSH_KEY`, `SERVER_IP`)
2. Create both environments (`staging`, `production`)
3. Enable required reviewers for production
4. Test with a small change: `git commit --allow-empty -m "test: deployment" && git push origin main`
5. Watch the staging deployment succeed
6. Merge to release and test manual approval
