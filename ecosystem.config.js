const dotenv = require('dotenv');
const path = require('path');

// Load .env file
const envConfig = dotenv.config({ path: path.join(__dirname, '.env') });

if (envConfig.error) {
  console.error('Error loading .env file:', envConfig.error);
  process.exit(1);
}

console.log('[PM2 Config] Environment variables loaded from .env');

module.exports = {
  apps: [
    {
      name: 'outcraftly-app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/home/ubuntu/outcraftly-production',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 10000,
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'production'
      },
      error_file: '/home/ubuntu/.pm2/logs/outcraftly-app-error.log',
      out_file: '/home/ubuntu/.pm2/logs/outcraftly-app-out.log',
      time: true,
      wait_ready: true,
      listen_timeout: 30000,
      node_args: '--dns-result-order=ipv4first --max-old-space-size=768'
    },
    {
      name: 'outcraftly-worker',
      script: 'pnpm',
      args: 'worker:run',
      cwd: '/home/ubuntu/outcraftly-production',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 10000,
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'production'
      },
      error_file: '/home/ubuntu/.pm2/logs/outcraftly-worker-error.log',
      out_file: '/home/ubuntu/.pm2/logs/outcraftly-worker-out.log',
      time: true,
      node_args: '--dns-result-order=ipv4first --max-old-space-size=480'
    },
    {
      name: 'outcraftly-reply',
      script: 'pnpm',
      args: 'reply:run',
      cwd: '/home/ubuntu/outcraftly-production',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 10000,
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'production'
      },
      error_file: '/home/ubuntu/.pm2/logs/outcraftly-reply-error.log',
      out_file: '/home/ubuntu/.pm2/logs/outcraftly-reply-out.log',
      time: true,
      node_args: '--dns-result-order=ipv4first --max-old-space-size=480'
    }
  ]
};
