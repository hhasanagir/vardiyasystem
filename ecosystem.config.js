// PM2 Ecosystem Configuration for VardiyaOS Backend
//
// Usage:
//   pm2 start ecosystem.config.js              # Start all processes
//   pm2 start ecosystem.config.js --env production
//   pm2 restart ecosystem.config.js             # Restart all
//   pm2 logs                                    # View logs
//   pm2 monit                                   # Monitor processes

module.exports = {
  apps: [
    {
      name: "vardiya-backend",
      script: "dist/src/main.js",
      cwd: "./backend",
      instances: process.env.NODE_ENV === "production" ? 2 : 1,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "development",
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      max_memory_restart: "500M",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      min_uptime: 10000,
      kill_timeout: 10000,
      listen_timeout: 8000,
      shutdown_with_message: true,
    },
  ],
};
