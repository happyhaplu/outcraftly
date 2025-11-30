# Quick Reference: Staging VPS Commands

## 🚀 One-Line Fixes

### Deploy and Restart
```bash
./deploy-staging.sh
```

### Quick Health Check
```bash
curl -s https://staging.outcraftly.com/api/health | jq .
```

### Force Restart
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 restart outcraftly-staging --update-env"
```

### Run Diagnostics
```bash
./diagnose-staging.sh
```

---

## 🔍 Quick Checks

### Is the app running?
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 list"
```

### What's in the logs?
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 logs outcraftly-staging --lines 50 --nostream"
```

### Are env vars loaded?
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 env 0 | grep -E 'POSTGRES_URL|AUTH_SECRET|BASE_URL'"
```

### Database connected?
```bash
curl -s https://staging.outcraftly.com/api/health | jq '.database'
```

---

## 🛠️ Common Tasks

### Deploy Latest Code
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 << 'ENDSSH'
cd /home/ubuntu/outcraftly-staging
git pull origin main
pnpm install --frozen-lockfile
pnpm build
pm2 restart outcraftly-staging --update-env
ENDSSH
```

### Update Environment Variables
```bash
# 1. Edit .env on VPS
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "nano /home/ubuntu/outcraftly-staging/.env"

# 2. Restart with --update-env flag
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 restart outcraftly-staging --update-env"
```

### Clear Logs
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 flush"
```

### Check Memory Usage
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "free -h && pm2 list"
```

---

## 🚨 Emergency Commands

### Everything is broken - nuclear option
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 << 'ENDSSH'
cd /home/ubuntu/outcraftly-staging
pm2 delete outcraftly-staging
pm2 start ecosystem.config.js
pm2 save
sleep 5
curl http://localhost:3000/api/health | jq .
ENDSSH
```

### Rollback to previous ecosystem config
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 << 'ENDSSH'
cd /home/ubuntu/outcraftly-staging
cp ecosystem.config.js.backup ecosystem.config.js
pm2 restart outcraftly-staging
ENDSSH
```

### Full server reboot
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "sudo reboot"
# Wait 2 minutes, then verify
curl https://staging.outcraftly.com/api/health
```

---

## 📊 Monitoring One-Liners

### Follow logs in real-time
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 logs outcraftly-staging"
```

### Count digest errors today
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "grep -c 'digest' ~/.pm2/logs/outcraftly-staging-out-*.log || echo 0"
```

### Watch resource usage
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 monit"
```

### Check port 3000 listener
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "ss -tlnp | grep :3000"
```

---

## 🎯 Validation After Changes

Run these 4 commands after any deployment:

```bash
# 1. Check PM2 status
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 list"

# 2. Verify health
curl -s https://staging.outcraftly.com/api/health | jq '.status, .database, .env.postgresConfigured'

# 3. Check recent logs
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 logs outcraftly-staging --lines 20 --nostream"

# 4. Test login page loads
curl -I https://staging.outcraftly.com/sign-in
```

**Expected Results**:
- PM2 status: `online`
- Health: `healthy`, `connected`, `true`
- Logs: No errors, shows "Ready in Xms"
- Login: HTTP 200

---

## 💡 Pro Tips

### Tail logs with grep filter
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 logs outcraftly-staging | grep -E 'error|warn|fail'"
```

### Check last restart time
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 info outcraftly-staging | grep 'uptime'"
```

### Verify SSL cert expiry
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "sudo certbot certificates"
```

### Test database from VPS directly
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 << 'ENDSSH'
cd /home/ubuntu/outcraftly-staging
node -e "require('dotenv').config(); const pg = require('postgres'); const sql = pg(process.env.POSTGRES_URL); sql\`SELECT NOW()\`.then(r => console.log('DB OK:', r[0].now)).catch(e => console.error('DB Error:', e.message)).finally(() => process.exit());"
ENDSSH
```

---

## 🔗 Quick Links

- **Staging URL**: https://staging.outcraftly.com
- **Health Endpoint**: https://staging.outcraftly.com/api/health
- **PM2 Logs Location**: `~/.pm2/logs/outcraftly-staging-*.log`
- **App Directory**: `/home/ubuntu/outcraftly-staging`
- **SSH Key**: `~/.ssh/id_ed25519`
- **VPS IP**: `155.133.26.49`

---

## 📝 Aliases (Optional)

Add these to your `~/.bashrc` or `~/.zshrc` for even faster access:

```bash
# Staging VPS shortcuts
alias staging-ssh='ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49'
alias staging-logs='ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 logs outcraftly-staging"'
alias staging-health='curl -s https://staging.outcraftly.com/api/health | jq .'
alias staging-restart='ssh -i ~/.ssh/id_ed25519 ubuntu@155.133.26.49 "pm2 restart outcraftly-staging --update-env"'
alias staging-deploy='./deploy-staging.sh'
alias staging-diag='./diagnose-staging.sh'
```

Then reload your shell: `source ~/.bashrc` or `source ~/.zshrc`

Usage:
```bash
staging-health     # Check health
staging-logs       # View logs
staging-restart    # Restart app
staging-deploy     # Full deployment
```

---

**Save this file** for quick reference during debugging sessions!
