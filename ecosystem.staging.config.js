const dotenv = require('dotenv');
const path = require('path');

// Load .env file from staging directory
const envConfig = dotenv.config({ path: path.join(__dirname, '.env') });

if (envConfig.error) {
  console.error('Error loading .env file:', envConfig.error);
  process.exit(1);
}

console.log('[PM2 Config] Staging environment variables loaded from .env');

module.exports = {
  apps: [
    {
      name: 'staging-app',
      script: 'pnpm',
      args: 'start',
      cwd: '/home/ubuntu/outcraftly-staging',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'production',
        PORT: 3100
      },
      error_file: '/home/ubuntu/.pm2/logs/staging-app-error.log',
      out_file: '/home/ubuntu/.pm2/logs/staging-app-out.log',
      time: true,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      node_args: '--dns-result-order=ipv4first'
    },
    {
      name: 'staging-worker',
      script: 'pnpm',
      args: 'worker:run',
      cwd: '/home/ubuntu/outcraftly-staging',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'production',
        PORT: 3100
      },
      error_file: '/home/ubuntu/.pm2/logs/staging-worker-error.log',
      out_file: '/home/ubuntu/.pm2/logs/staging-worker-out.log',
      time: true,
      kill_timeout: 5000,
      node_args: '--dns-result-order=ipv4first'
    },
    {
      name: 'staging-reply',
      script: 'pnpm',
      args: 'reply:run',
      cwd: '/home/ubuntu/outcraftly-staging',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        ...envConfig.parsed,
        NODE_ENV: 'production',
        PORT: 3100
      },
      error_file: '/home/ubuntu/.pm2/logs/staging-reply-error.log',
      out_file: '/home/ubuntu/.pm2/logs/staging-reply-out.log',
      time: true,
      kill_timeout: 5000,
      node_args: '--dns-result-order=ipv4first'
    }
  ]
};
