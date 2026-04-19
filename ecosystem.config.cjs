/**
 * PM2 process manifest for namecard-web.
 *
 * Start:
 *   pm2 start ecosystem.config.cjs --env production
 *
 * Reload after deploy (zero-downtime):
 *   pm2 reload namecard-web
 *
 * Save PM2 process list + enable launchd startup:
 *   pm2 save && pm2 startup launchd   (owner: openclaw)
 *
 * Logs:
 *   pm2 logs namecard-web
 *   tail -f ~/.pm2/logs/namecard-web-out.log
 *   tail -f ~/.pm2/logs/namecard-web-error.log
 */
module.exports = {
  apps: [
    {
      name: "namecard-web",
      script: "pnpm",
      args: "start",
      cwd: "/Users/openclaw/.openclaw/shared/projects/namecard-web",
      // pnpm is itself a Node script; set interpreter to "none" so PM2 doesn't
      // try to wrap it with another node invocation.
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "500M",
      watch: false,
      autorestart: true,
      env_production: {
        NODE_ENV: "production",
        PORT: "3014",
        NAMECARD_BASE_PATH: "/namecard-web",
        // All secrets must be provided in .env.production (see .env.production.example).
        // PM2 does NOT auto-load .env files; source them before starting or use
        // the dotenv trick: add `node -r dotenv/config` to args if needed.
        // Recommended: pipe via `pm2 start ... --env-file .env.production` (PM2 v5+)
        // or export vars in the shell before `pm2 start`.
      },
      error_file: "/Users/openclaw/.pm2/logs/namecard-web-error.log",
      out_file: "/Users/openclaw/.pm2/logs/namecard-web-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
