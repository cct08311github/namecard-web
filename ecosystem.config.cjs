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
 *
 * Env: .env.production is parsed below and merged into env_production.
 * Next.js 16 + Turbopack does not reliably load .env.production at
 * runtime the way Next 13/14 did under Webpack, and PM2 does not
 * auto-load dotenv — so we parse the file here at config eval time.
 * After editing .env.production, re-run `pm2 start ecosystem.config.cjs
 * --env production && pm2 save` to refresh the dump.pm2 env snapshot
 * used by `pm2 resurrect` on reboot.
 */
/* eslint-disable @typescript-eslint/no-require-imports --
 * PM2 config is CommonJS by design — PM2 loads it via require() and
 * only supports CJS. Using require() here is correct, not accidental.
 */
const fs = require("node:fs");
const path = require("node:path");

function parseDotenv(filepath) {
  const env = {};
  if (!fs.existsSync(filepath)) return env;
  const content = fs.readFileSync(filepath, "utf8");
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }
  return env;
}

const PROJECT_DIR = "/Users/openclaw/.openclaw/shared/projects/namecard-web";
const dotenvProd = parseDotenv(path.join(PROJECT_DIR, ".env.production"));

module.exports = {
  apps: [
    {
      name: "namecard-web",
      script: "pnpm",
      args: "start",
      cwd: PROJECT_DIR,
      // pnpm is itself a Node script; set interpreter to "none" so PM2 doesn't
      // try to wrap it with another node invocation.
      interpreter: "none",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "500M",
      watch: false,
      autorestart: true,
      env_production: {
        // Secrets first so explicit fields below can override if needed.
        ...dotenvProd,
        NODE_ENV: "production",
        PORT: "3014",
        NAMECARD_BASE_PATH: "/namecard-web",
      },
      error_file: "/Users/openclaw/.pm2/logs/namecard-web-error.log",
      out_file: "/Users/openclaw/.pm2/logs/namecard-web-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
