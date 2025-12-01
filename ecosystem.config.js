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
      script: 'pnpm',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'production'
      },
      error_file: '~/.pm2/logs/outcraftly-app-error.log',
      out_file: '~/.pm2/logs/outcraftly-app-out.log',
      time: true,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      node_args: '--dns-result-order=ipv4first'
    },
    {
      name: 'outcraftly-worker',
      script: 'pnpm',
      args: 'worker:run',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'production'
      },
      error_file: '~/.pm2/logs/outcraftly-worker-error.log',
      out_file: '~/.pm2/logs/outcraftly-worker-out.log',
      time: true,
      kill_timeout: 5000,
      node_args: '--dns-result-order=ipv4first'
    },
    {
      name: 'outcraftly-reply',
      script: 'pnpm',
      args: 'reply:run',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'production'
      },
      error_file: '~/.pm2/logs/outcraftly-reply-error.log',
      out_file: '~/.pm2/logs/outcraftly-reply-out.log',
      time: true,
      kill_timeout: 5000,
      node_args: '--dns-result-order=ipv4first'
    }
  ]
};
