# Coolify Setup - Step-by-Step Instructions

## Current Status
✅ Coolify installed and running at: http://155.133.26.49:8000
✅ Admin account created
✅ Server configured (localhost)
✅ Project created (Outcraftly)
✅ GitHub Actions will handle CI (linting, building, testing)
⏳ Need to configure Coolify for CD (deployment)

---

## Step 1: Get Your API Token (Optional - for automation)

1. Go to: http://155.133.26.49:8000/security/api-tokens
2. Click **"Create New Token"**
3. Name: `Deployment Setup`
4. Copy the token and save it

Then run:
```bash
cd /home/harekrishna/Projects/outcraftly
./scripts/setup-coolify-apps.sh
```

---

## Step 2: Connect GitHub (REQUIRED - Must do in browser)

1. Click **"Sources"** in left menu
2. Click **"+ Add"** button
3. Select **"GitHub"**
4. Click **"Install GitHub App"** or **"Authorize"**
5. GitHub popup opens → Login if needed
6. On GitHub authorization page:
   - Select **"Only select repositories"**
   - Choose **"happyhaplu/outcraftly"**
   - Click **"Install & Authorize"**
7. You'll be redirected back to Coolify
8. Your GitHub source should now appear in the list

---

## Step 3: Deploy Staging Application

### A. Create the Application

1. Go to **"Projects"** → Click **"Outcraftly"**
2. You'll see two environments: **"production"** and **"staging"**
3. Click on **"staging"** environment
4. Click **"+ New Resource"**
5. Select **"Application"**

### B. Configure Source

1. **Source**: Select your GitHub source (happyhaplu/outcraftly)
2. **Repository**: Should auto-select `outcraftly`
3. **Branch**: `main`
4. **Build Pack**: Select `nixpacks` (auto-detects Next.js)
5. Click **"Continue"** or **"Next"**

### C. Configure Application Settings

**General Tab:**
- **Name**: `staging-app`
- **Description**: `Staging environment for Outcraftly`

**Domains Tab:**
- **Domain**: `staging.outcraftly.com`
- ✅ Enable **"Generate Let's Encrypt Certificate"**

**Build Tab:**
- **Build Command**: Leave default or set to `pnpm build`
- **Start Command**: Leave default or set to `pnpm start`
- **Port**: `3000`
- **Base Directory**: `/` (root)

### D. Add Environment Variables

Click **"Environment Variables"** tab and add these one by one:

**Click "+ Add" for each:**

```
AUTH_SECRET=<your_secret>
BASE_URL=https://staging.outcraftly.com
DEBUG_INBOUND=<your_value>
MIN_SEND_INTERVAL_MINUTES=<your_value>
POSTGRES_URL=<your_supabase_staging_url>
REPLY_WORKER_SECRET=<your_secret>
SENDER_CREDENTIALS_KEY=<your_secret>
SEQUENCE_EVENTS_SECRET=<your_secret>
SEQUENCE_WORKER_SECRET=<your_secret>
STRIPE_SECRET_KEY=<your_secret>
STRIPE_WEBHOOK_SECRET=<your_secret>
NODE_ENV=production
PORT=3000
```

### E. Deploy

1. Click **"Save"** to save all settings
2. Click **"Deploy"** button (top right)
3. Watch the deployment logs in real-time
4. Wait for **"Application started successfully"** message

**First deployment takes 5-10 minutes** (building, installing dependencies, etc.)

---

## Step 4: Deploy Production Application

Repeat Step 3, but in the **"production"** environment with these changes:

**Different settings:**
- **Branch**: `release` (instead of main)
- **Name**: `production-app`
- **Domain**: `app.outcraftly.com`
- **BASE_URL**: `https://app.outcraftly.com`
- **POSTGRES_URL**: Use your production Supabase URL

---

## Step 5: Configure Automatic Deployments (Webhooks)

After successful deployment, Coolify automatically sets up webhooks in GitHub.

**Verify webhooks:**
1. Go to GitHub: https://github.com/happyhaplu/outcraftly/settings/hooks
2. You should see Coolify webhooks
3. These will trigger deployments on push:
   - Push to `main` → Auto-deploy staging
   - Push to `release` → Auto-deploy production

---

## Step 6: Test the Deployment

### Test Staging:
```bash
curl -I https://staging.outcraftly.com
```

Should return:
- Status: 200 OK or 307 Redirect
- SSL certificate valid

### Test Production:
```bash
curl -I https://app.outcraftly.com
```

---

## Step 7: Switch from PM2 to Coolify (After Testing)

**ONLY after you've tested Coolify deployments thoroughly:**

```bash
# Stop old PM2 services
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49
/usr/bin/pm2 delete all
/usr/bin/pm2 save
```

Coolify will take over ports 80/443 automatically.

---

## Troubleshooting

### Can't Find GitHub Source
- Make sure you completed Step 2 (Connect GitHub)
- Check Sources page for the connected repository

### Deployment Fails
- Check logs in Coolify (real-time in the deployment view)
- Verify all environment variables are set correctly
- Ensure domain DNS points to 155.133.26.49

### SSL Certificate Issues
- Wait 5-10 minutes after deployment
- DNS must be pointing correctly
- Let's Encrypt needs to verify domain ownership

### Port Conflicts
- If PM2 apps are still running on ports 80/443
- Coolify might fail to bind ports
- Stop PM2 apps first (Step 7)

---

## What Happens Now?

### With GitHub Actions (CI):
- Push to any branch → Runs tests and linting
- Build succeeds → ✅ Ready to deploy
- Build fails → ❌ Fix before deploying

### With Coolify (CD):
- Push to `main` → Auto-deploys to staging.outcraftly.com
- Push to `release` → Auto-deploys to app.outcraftly.com
- Zero-downtime deployments
- Automatic SSL renewal
- Built-in rollback if deployment fails

---

## Summary of URLs

| Service | URL |
|---------|-----|
| Coolify Dashboard | http://155.133.26.49:8000 |
| Staging App | https://staging.outcraftly.com |
| Production App | https://app.outcraftly.com |
| GitHub Repo | https://github.com/happyhaplu/outcraftly |
| GitHub Actions | https://github.com/happyhaplu/outcraftly/actions |

---

## Need Help?

If you get stuck on any step, just tell me:
1. Which step you're on
2. What you're seeing on screen
3. Any error messages

I'll guide you through it! 🚀
