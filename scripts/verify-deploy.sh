#!/usr/bin/env bash
# ============================================================
# scripts/verify-deploy.sh
# namecard-web 部署健康檢查
#
# 檢查項目：
#   1. PM2 process "namecard-web" 狀態為 online
#   2. Docker container "namecard-typesense" 正在執行
#   3. Next.js localhost:3013/namecard-web/api/health 回應 200
#   4. tailscale serve status 包含 /namecard-web 路由
#   5. Typesense http://127.0.0.1:8108/health 回應 {"ok":true}
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
info "[1/5] PM2 process namecard-web ..."
if pm2 list --no-color 2>/dev/null | grep -q "namecard-web.*online"; then
  pass "PM2 namecard-web is online"
else
  fail "PM2 namecard-web is NOT online (run: pm2 start ecosystem.config.cjs --env production)"
fi

# ---- 2. Docker container running ----------------------------
info "[2/5] Docker container namecard-typesense ..."
CONTAINER_STATUS=$(docker inspect --format='{{.State.Status}}' namecard-typesense 2>/dev/null || echo "missing")
if [ "$CONTAINER_STATUS" = "running" ]; then
  pass "Docker namecard-typesense is running"
else
  fail "Docker namecard-typesense status: ${CONTAINER_STATUS} (run: docker compose -f docker-compose.prod.yml up -d)"
fi

# ---- 3. Next.js health endpoint -----------------------------
info "[3/5] Next.js http://localhost:3013/namecard-web/api/health ..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  "http://localhost:3013/namecard-web/api/health" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass "Next.js health endpoint returned 200"
else
  fail "Next.js health endpoint returned HTTP ${HTTP_CODE} (expected 200)"
fi

# ---- 4. Tailscale Serve path --------------------------------
info "[4/5] Tailscale Serve /namecard-web route ..."
if /usr/local/bin/tailscale serve status 2>/dev/null | grep -q "/namecard-web"; then
  pass "Tailscale Serve includes /namecard-web"
else
  fail "Tailscale Serve does NOT include /namecard-web (run: tailscale serve --bg --set-path=/namecard-web http://localhost:3013)"
fi

# ---- 5. Typesense health ------------------------------------
info "[5/5] Typesense http://127.0.0.1:8108/health ..."
TS_BODY=$(curl -s --max-time 5 "http://127.0.0.1:8108/health" 2>/dev/null || echo "")
if echo "$TS_BODY" | grep -q '"ok":true'; then
  pass "Typesense healthy: ${TS_BODY}"
else
  fail "Typesense unhealthy — got: '${TS_BODY}'"
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
