module.exports = {
  apps: [
    {
      name: 're-museum',
      cwd: __dirname,
      script: './build/server/server.js',
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'node',
      env: {
        APP_ROOT: __dirname,
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: '.env',
      autorestart: true,
      exp_backoff_restart_delay: 200,
      kill_timeout: 5000,
      listen_timeout: 8000,
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },
  ],
};
