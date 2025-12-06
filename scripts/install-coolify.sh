#!/bin/bash

# Coolify Installation Script for Ubuntu VPS
# Run this on your VPS: bash <(curl -fsSL https://raw.githubusercontent.com/happyhaplu/outcraftly/main/scripts/install-coolify.sh)

set -e

echo "🚀 Installing Coolify on Ubuntu VPS"
echo "====================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  This script needs sudo privileges"
    echo "Please run: sudo bash install-coolify.sh"
    exit 1
fi

# System requirements check
echo "📋 Checking system requirements..."
FREE_MEM=$(free -g | awk '/^Mem:/{print $4}')
if [ "$FREE_MEM" -lt 2 ]; then
    echo "⚠️  Warning: Low memory detected. Coolify needs at least 2GB free RAM"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# Install Coolify
echo "🎯 Installing Coolify..."
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

echo ""
echo "✅ Coolify installation complete!"
echo ""
echo "📝 Next steps:"
echo "1. Access Coolify at: http://155.133.26.49:8000"
echo "2. Or set up domain: https://<your-coolify-domain>:8000"
echo "3. Create your first admin account"
echo "4. Add your GitHub repository"
echo "5. Configure environment variables"
echo ""
echo "⚠️  Important: Change the default port 8000 to something secure"
echo "⚠️  Important: Set up SSL/TLS certificates for secure access"
echo ""
