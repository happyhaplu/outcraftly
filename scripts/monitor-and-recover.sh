#!/bin/bash

# PM2 Health Monitor and Auto-Recovery Script
# Add to crontab: */5 * * * * /path/to/monitor-and-recover.sh >> /var/log/outcraftly-monitor.log 2>&1

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
ALERT_EMAIL="${ALERT_EMAIL:-}"  # Set this to receive alerts

echo "[$TIMESTAMP] Starting health check..."

# Function to send alert (optional)
send_alert() {
    local message="$1"
    echo "[$TIMESTAMP] ALERT: $message"
    # Uncomment to enable email alerts:
    # if [ ! -z "$ALERT_EMAIL" ]; then
    #     echo "$message" | mail -s "Outcraftly Server Alert" "$ALERT_EMAIL"
    # fi
}

# Function to check and restart app
check_and_restart() {
    local app_name="$1"
    local port="$2"
    local app_dir="$3"
    local domain="$4"
    
    echo "[$TIMESTAMP] Checking $app_name on port $port..."
    
    # Check if PM2 process exists and is online
    PM2_STATUS=$(pm2 list | grep "$app_name" | grep -o "online\|stopped\|errored" | head -1)
    
    if [ "$PM2_STATUS" != "online" ]; then
        echo "[$TIMESTAMP] ❌ $app_name is $PM2_STATUS"
        send_alert "$app_name is $PM2_STATUS - attempting restart"
        
        cd "$app_dir" || return 1
        pm2 delete "$app_name" 2>/dev/null
        sleep 2
        pm2 start ecosystem.config.js
        pm2 save
        sleep 10
        
        echo "[$TIMESTAMP] ✓ Restarted $app_name"
        return 0
    fi
    
    # Check if port is listening
    if ! netstat -tln | grep -q ":$port "; then
        echo "[$TIMESTAMP] ❌ Port $port not listening"
        send_alert "$app_name port $port not listening - attempting restart"
        
        cd "$app_dir" || return 1
        pm2 restart "$app_name"
        sleep 10
        
        echo "[$TIMESTAMP] ✓ Restarted $app_name due to port issue"
        return 0
    fi
    
    # Check HTTP health
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$port/api/health" 2>/dev/null)
    
    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "404" ]; then
        echo "[$TIMESTAMP] ❌ $app_name health check failed (HTTP $HTTP_CODE)"
        send_alert "$app_name health check failed - attempting restart"
        
        cd "$app_dir" || return 1
        pm2 restart "$app_name"
        sleep 10
        
        echo "[$TIMESTAMP] ✓ Restarted $app_name due to health check failure"
        return 0
    fi
    
    # Check restart count
    RESTART_COUNT=$(pm2 list | grep "$app_name" | awk '{print $10}' | sed 's/[^0-9]//g')
    if [ ! -z "$RESTART_COUNT" ] && [ "$RESTART_COUNT" -gt 10 ]; then
        echo "[$TIMESTAMP] ⚠️  $app_name has restarted $RESTART_COUNT times"
        send_alert "$app_name has high restart count: $RESTART_COUNT"
    fi
    
    echo "[$TIMESTAMP] ✓ $app_name is healthy (HTTP $HTTP_CODE)"
    return 0
}

# Check memory usage
MEMORY_USAGE=$(free | grep Mem | awk '{print int($3/$2 * 100)}')
echo "[$TIMESTAMP] Memory usage: ${MEMORY_USAGE}%"

if [ "$MEMORY_USAGE" -gt 90 ]; then
    echo "[$TIMESTAMP] ⚠️  High memory usage detected"
    send_alert "High memory usage: ${MEMORY_USAGE}%"
    
    # Show top memory consumers
    ps aux --sort=-%mem | head -5
fi

# Check staging
if [ -d "/home/ubuntu/outcraftly-staging" ]; then
    check_and_restart "outcraftly-staging" "3000" "/home/ubuntu/outcraftly-staging" "staging.outcraftly.com"
fi

# Check production
if [ -d "/home/ubuntu/outcraftly-production" ]; then
    check_and_restart "outcraftly-production" "3001" "/home/ubuntu/outcraftly-production" "app.outcraftly.com"
fi

# Check for app name variations
if pm2 list | grep -q "outcraftly-app"; then
    check_and_restart "outcraftly-app" "3000" "$PWD" "staging.outcraftly.com"
fi

# Check Nginx status
if ! systemctl is-active --quiet nginx; then
    echo "[$TIMESTAMP] ❌ Nginx is not running"
    send_alert "Nginx is not running - attempting restart"
    sudo systemctl restart nginx
    echo "[$TIMESTAMP] ✓ Restarted Nginx"
else
    echo "[$TIMESTAMP] ✓ Nginx is running"
fi

# Clean old logs (keep last 7 days)
find ~/.pm2/logs -name "*.log" -mtime +7 -delete 2>/dev/null
find /var/log/nginx -name "*.log.*" -mtime +7 -delete 2>/dev/null

echo "[$TIMESTAMP] Health check complete"
echo "----------------------------------------"
