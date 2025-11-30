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
      name: 'outcraftly-staging',
      script: 'pnpm',
      args: 'start:staging',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      cwd: '/home/ubuntu/outcraftly-staging',
      env: {
        ...envConfig.parsed,
        HOST: '0.0.0.0',
        __NEXT_PRIVATE_HOST: 'staging.outcraftly.com'
      },  // ✅ PRIMARY FIX: Pass env vars directly to child process
      error_file: '~/.pm2/logs/outcraftly-staging-error.log',
      out_file: '~/.pm2/logs/outcraftly-staging-out.log',
      time: true,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      node_args: '--dns-result-order=ipv4first'
    }
  ]
};
