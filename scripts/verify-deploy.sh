#!/usr/bin/env bash
# ============================================================
# scripts/verify-deploy.sh
# namecard-web 部署健康檢查
#
# 檢查項目：
#   1. PM2 process "namecard-web" 狀態為 online
#   2. Docker container "namecard-typesense" 正在執行
#   3. Next.js localhost:3014/namecard-web/api/health 回應 200
#   4. tailscale serve status 包含 /namecard-web 路由
#   5. Typesense http://127.0.0.1:8108/health 回應 {"ok":true}
#   6. Typesense `cards` collection 已建立（bootstrap 過）
#   7. PM2 process 實際有拿到 .env.production 的關鍵 secret
#
# 用法：
#   scripts/verify-deploy.sh
#
# 結束碼：
#   0 — 全部通過
#   1 — 至少一項失敗
# ============================================================

set -euo pipefail

# ---- 顏色輸出 -----------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; FAILED=1; }
info() { echo -e "${YELLOW}→${NC} $*"; }

FAILED=0

echo ""
echo "=================================================="
echo " namecard-web 部署健康檢查"
echo "=================================================="
echo ""

# ---- 1. PM2 process online ----------------------------------
info "[1/7] PM2 process namecard-web ..."
if pm2 list --no-color 2>/dev/null | grep -q "namecard-web.*online"; then
  pass "PM2 namecard-web is online"
else
  fail "PM2 namecard-web is NOT online (run: pm2 start ecosystem.config.cjs --env production)"
fi

# ---- 2. Docker container running ----------------------------
info "[2/7] Docker container namecard-typesense ..."
CONTAINER_STATUS=$(docker inspect --format='{{.State.Status}}' namecard-typesense 2>/dev/null || echo "missing")
if [ "$CONTAINER_STATUS" = "running" ]; then
  pass "Docker namecard-typesense is running"
else
  fail "Docker namecard-typesense status: ${CONTAINER_STATUS} (run: docker compose -f docker-compose.prod.yml up -d)"
fi

# ---- 3. Next.js health endpoint -----------------------------
info "[3/7] Next.js http://localhost:3014/namecard-web/api/health ..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  "http://localhost:3014/namecard-web/api/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass "Next.js health endpoint returned 200"
else
  fail "Next.js health endpoint returned HTTP ${HTTP_CODE} (expected 200)"
fi

# ---- 4. Tailscale Serve path --------------------------------
info "[4/7] Tailscale Serve /namecard-web route ..."
if /usr/local/bin/tailscale serve status 2>/dev/null | grep -q "/namecard-web"; then
  pass "Tailscale Serve includes /namecard-web"
else
  fail "Tailscale Serve does NOT include /namecard-web (run: tailscale serve --bg --set-path=/namecard-web http://localhost:3014/namecard-web)"
fi

# ---- 5. Typesense health ------------------------------------
info "[5/7] Typesense http://127.0.0.1:8108/health ..."
TS_BODY=$(curl -s --max-time 5 "http://127.0.0.1:8108/health" 2>/dev/null || echo "")
if echo "$TS_BODY" | grep -q '"ok":true'; then
  pass "Typesense healthy: ${TS_BODY}"
else
  fail "Typesense unhealthy — got: '${TS_BODY}'"
fi

# ---- 6. Typesense cards collection --------------------------
info "[6/7] Typesense \`cards\` collection bootstrapped ..."
# Load TYPESENSE_API_KEY from .env.production if not already in shell.
if [ -z "${TYPESENSE_API_KEY:-}" ] && [ -f ".env.production" ]; then
  TYPESENSE_API_KEY=$(grep '^TYPESENSE_API_KEY=' .env.production | cut -d= -f2- | tr -d "'\"")
fi
if [ -z "${TYPESENSE_API_KEY:-}" ]; then
  fail "Cannot read TYPESENSE_API_KEY — skip collection check"
else
  COLL_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -H "X-TYPESENSE-API-KEY: ${TYPESENSE_API_KEY}" \
    "http://127.0.0.1:8108/collections/cards" 2>/dev/null || echo "000")
  if [ "$COLL_HTTP" = "200" ]; then
    pass "Typesense \`cards\` collection exists"
  else
    fail "Typesense \`cards\` collection missing (HTTP ${COLL_HTTP}) — run: pnpm search:bootstrap"
  fi
fi

# ---- 7. PM2 process has env from .env.production ------------
info "[7/7] PM2 process inherits secrets from .env.production ..."
# ps eww shows the Node process's environ. We spot-check two critical
# keys. If either is missing, the app degrades silently (e.g. search
# returns degraded:true with no stderr, Firebase Admin SDK auth fails).
PM2_PID=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    ps = json.load(sys.stdin)
    p = next((x for x in ps if x['name'] == 'namecard-web' and x['pm2_env']['status'] == 'online'), None)
    print(p['pid'] if p else '')
except Exception:
    print('')
" 2>/dev/null)

if [ -z "$PM2_PID" ]; then
  fail "Cannot locate namecard-web PID — skip env check"
else
  # macOS ps eww prints space-separated KEY=VALUE pairs after the command.
  # We look for presence of the key name before the = sign.
  PROCESS_ENV=$(ps eww -o command= -p "$PM2_PID" 2>/dev/null || echo "")
  missing=""
  for key in TYPESENSE_API_KEY GOOGLE_APPLICATION_CREDENTIALS; do
    if ! echo "$PROCESS_ENV" | tr ' ' '\n' | grep -q "^${key}="; then
      missing="${missing} ${key}"
    fi
  done
  if [ -z "$missing" ]; then
    pass "PM2 process has TYPESENSE_API_KEY + GOOGLE_APPLICATION_CREDENTIALS"
  else
    fail "PM2 process missing env:${missing} (restart: pm2 start ecosystem.config.cjs --env production && pm2 save)"
  fi
fi

# ---- 結果 ---------------------------------------------------
echo ""
echo "=================================================="
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}全部通過 — namecard-web 運行正常${NC}"
  echo " 外部存取：https://mac-mini.tailde842d.ts.net/namecard-web/"
else
  echo -e "${RED}部分檢查失敗 — 請依上方提示排查${NC}"
fi
echo "=================================================="
echo ""

exit "$FAILED"
