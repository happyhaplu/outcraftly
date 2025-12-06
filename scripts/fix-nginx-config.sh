#!/bin/bash

# Nginx Configuration Fix for 502/504 Timeout Issues
# Run this on the server: sudo bash fix-nginx-config.sh

echo "======================================"
echo "🔧 NGINX CONFIGURATION FIX"
echo "======================================"
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root or with sudo"
    exit 1
fi

# Backup existing configs
echo "Creating backups..."
mkdir -p /etc/nginx/backups
cp /etc/nginx/nginx.conf /etc/nginx/backups/nginx.conf.$(date +%Y%m%d_%H%M%S)
[ -f /etc/nginx/sites-available/staging.outcraftly.com ] && cp /etc/nginx/sites-available/staging.outcraftly.com /etc/nginx/backups/staging.outcraftly.com.$(date +%Y%m%d_%H%M%S)
[ -f /etc/nginx/sites-available/app.outcraftly.com ] && cp /etc/nginx/sites-available/app.outcraftly.com /etc/nginx/backups/app.outcraftly.com.$(date +%Y%m%d_%H%M%S)

echo "✓ Backups created in /etc/nginx/backups/"

# Create optimized nginx.conf
echo ""
echo "Updating /etc/nginx/nginx.conf..."

cat > /etc/nginx/nginx.conf << 'EOF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 2048;
    use epoll;
    multi_accept on;
}

http {
    ##
    # Basic Settings
    ##
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    types_hash_max_size 2048;
    server_tokens off;

    # Increased timeouts to prevent 504 Gateway Timeout
    keepalive_timeout 75s;
    keepalive_requests 100;
    
    # Proxy timeouts - CRITICAL FOR FIXING 504/502
    proxy_connect_timeout 600s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;
    send_timeout 600s;
    
    # Buffer sizes
    client_body_buffer_size 128k;
    client_max_body_size 20M;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 16k;
    proxy_buffer_size 4k;
    proxy_buffers 8 16k;
    proxy_busy_buffers_size 32k;

    # server_names_hash_bucket_size 64;
    # server_name_in_redirect off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    ##
    # SSL Settings
    ##
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    ##
    # Logging Settings
    ##
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log warn;

    ##
    # Gzip Settings
    ##
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
    gzip_disable "msie6";

    ##
    # Virtual Host Configs
    ##
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
EOF

echo "✓ nginx.conf updated"

# Create staging config
echo ""
echo "Creating staging.outcraftly.com configuration..."

cat > /etc/nginx/sites-available/staging.outcraftly.com << 'EOF'
upstream staging_backend {
    server 127.0.0.1:3000 fail_timeout=30s max_fails=3;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name staging.outcraftly.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name staging.outcraftly.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/staging.outcraftly.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.outcraftly.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/staging.outcraftly.com/chain.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/staging.outcraftly.com.access.log;
    error_log /var/log/nginx/staging.outcraftly.com.error.log warn;

    # Timeouts - CRITICAL FOR FIXING 504/502
    proxy_connect_timeout 600s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;
    send_timeout 600s;

    # Max body size
    client_max_body_size 20M;

    location / {
        # Proxy headers
        proxy_pass http://staging_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # Prevent caching of proxied content
        proxy_cache_bypass $http_upgrade;
        proxy_no_cache $http_upgrade;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 16k;
        proxy_busy_buffers_size 32k;
        
        # Timeouts
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        
        # Handle errors
        proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;
        proxy_next_upstream_tries 2;
        proxy_next_upstream_timeout 10s;
    }

    # Health check endpoint
    location /api/health {
        proxy_pass http://staging_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }

    # Static files caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://staging_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

echo "✓ staging.outcraftly.com configuration created"

# Create production config
echo ""
echo "Creating app.outcraftly.com configuration..."

cat > /etc/nginx/sites-available/app.outcraftly.com << 'EOF'
upstream production_backend {
    server 127.0.0.1:3001 fail_timeout=30s max_fails=3;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name app.outcraftly.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name app.outcraftly.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/app.outcraftly.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.outcraftly.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/app.outcraftly.com/chain.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logging
    access_log /var/log/nginx/app.outcraftly.com.access.log;
    error_log /var/log/nginx/app.outcraftly.com.error.log warn;

    # Timeouts - CRITICAL FOR FIXING 504/502
    proxy_connect_timeout 600s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;
    send_timeout 600s;

    # Max body size
    client_max_body_size 20M;

    location / {
        # Proxy headers
        proxy_pass http://production_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # Prevent caching of proxied content
        proxy_cache_bypass $http_upgrade;
        proxy_no_cache $http_upgrade;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 16k;
        proxy_busy_buffers_size 32k;
        
        # Timeouts
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        
        # Handle errors
        proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;
        proxy_next_upstream_tries 2;
        proxy_next_upstream_timeout 10s;
    }

    # Health check endpoint
    location /api/health {
        proxy_pass http://production_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }

    # Static files caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://production_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

echo "✓ app.outcraftly.com configuration created"

# Enable sites
echo ""
echo "Enabling sites..."
ln -sf /etc/nginx/sites-available/staging.outcraftly.com /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/app.outcraftly.com /etc/nginx/sites-enabled/

# Test configuration
echo ""
echo "Testing Nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Configuration is valid"
    echo ""
    echo "Reloading Nginx..."
    systemctl reload nginx
    echo "✓ Nginx reloaded successfully"
    echo ""
    echo "======================================"
    echo "✅ NGINX CONFIGURATION UPDATED"
    echo "======================================"
    echo ""
    echo "Key improvements:"
    echo "  • Increased proxy timeouts to 600s"
    echo "  • Optimized buffer sizes"
    echo "  • Added upstream health checks"
    echo "  • Improved error handling"
    echo "  • Enhanced keepalive settings"
    echo ""
    echo "Monitor with:"
    echo "  sudo tail -f /var/log/nginx/error.log"
    echo "  sudo tail -f /var/log/nginx/staging.outcraftly.com.error.log"
    echo "  sudo tail -f /var/log/nginx/app.outcraftly.com.error.log"
else
    echo ""
    echo "✗ Configuration has errors - not reloading"
    echo "Check the errors above and fix manually"
    exit 1
fi
