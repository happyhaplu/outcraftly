#!/bin/bash
# Deployment script for staging VPS
# Usage: ./deploy-staging.sh

set -e

SSH_KEY="$HOME/.ssh/id_ed25519"
VPS_HOST="ubuntu@155.133.26.49"
DEPLOY_DIR="/home/ubuntu/outcraftly-staging"

echo "🚀 Deploying to staging VPS..."

ssh -i "$SSH_KEY" "$VPS_HOST" << 'ENDSSH'
set -e

cd /home/ubuntu/outcraftly-staging

echo "📦 Pulling latest changes..."
git pull origin main

echo "📋 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🏗️  Building application..."
pnpm build

echo "🔄 Restarting PM2 with updated environment..."
pm2 restart outcraftly-staging --update-env

echo "⏳ Waiting for app to start..."
sleep 5

echo "🏥 Checking health endpoint..."
curl -f http://localhost:3000/api/health | jq . || echo "⚠️  Health check failed"

echo "📊 PM2 Status:"
pm2 list

echo "📝 Recent logs:"
pm2 logs outcraftly-staging --lines 20 --nostream

echo "✅ Deployment complete!"
ENDSSH

echo ""
echo "🎉 Staging deployment finished!"
echo "🔍 Check status: https://staging.outcraftly.com/api/health"
