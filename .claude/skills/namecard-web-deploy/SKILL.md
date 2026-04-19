---
name: namecard-web-deploy
description: Mac mini M4 deployment operations for namecard-web — use when deploying, restarting, rebuilding after merge, recovering after reboot, troubleshooting Tailscale sub-path routing, or verifying the `https://mac-mini.tailde842d.ts.net/namecard-web/` endpoint. Covers PM2 / Tailscale serve / Typesense / Firebase auth domain / basePath build invariants.
---

# namecard-web 部署 skill

專用於 Mac mini M4 上 `namecard-web` 的部署、重建、重開機恢復、故障排除。

## 架構事實

- **Host**: Mac mini M4（你當前環境）
- **Public URL**: `https://mac-mini.tailde842d.ts.net/namecard-web/`
- **Routing**: Tailscale serve sub-path（**no** Nginx）
- **Process mgr**: PM2 id=10 `namecard-web`，`NODE_ENV=production`，listen `*:3014`
- **Project dir**: `/Users/openclaw/.openclaw/shared/projects/namecard-web`
- **Working project dir = PM2 cwd** — 在此跑 `pnpm build` 會覆蓋 live `.next/`（見 pitfall #1）
- **Search**: Typesense Docker container `namecard-typesense`，bind `127.0.0.1:8108`
- **Firebase project**: `namecard-web-prd`（service-account at `~/.config/namecard/service-account.json`）
- **.env**: `.env.production`（PM2 不自動載入，靠 `ecosystem.config.cjs` 的 `env_production` + shell export）

## 開機自恢復鏈（reboot survival）

| 組件                     | 機制                                                          | 檔案                                                                                                                   | 健檢                                          |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Tailscale daemon         | macOS System Extension                                        | (App Store Tailscale.app)                                                                                              | `tailscale status`                            |
| Tailscale serve mappings | LaunchAgent `com.openclaw.tailscale-serve` delay 30s          | `~/Library/LaunchAgents/com.openclaw.tailscale-serve.plist` → `/Users/openclaw/.openclaw/bin/tailscale-serve-setup.sh` | `tailscale serve status \| grep namecard-web` |
| PM2 daemon + processes   | LaunchAgent `com.PM2` runs `pm2 resurrect`                    | `~/Library/LaunchAgents/pm2.openclaw.plist` (reads `~/.pm2/dump.pm2`)                                                  | `pm2 list \| grep namecard-web`               |
| Typesense container      | Docker Desktop login item + compose `restart: unless-stopped` | `docker-compose.prod.yml`                                                                                              | `docker ps \| grep namecard-typesense`        |

**關鍵不變量**: 若新增 PM2 process 或改 Tailscale serve 映射，**必須**：

1. `pm2 save` — 更新 `~/.pm2/dump.pm2` 讓 resurrect 抓到新 process
2. 編輯 `/Users/openclaw/.openclaw/bin/tailscale-serve-setup.sh` 的 `PATH_MAPPINGS` 或 `MAPPINGS` 陣列
3. 跑一次 setup 腳本驗證：`bash /Users/openclaw/.openclaw/bin/tailscale-serve-setup.sh`

否則重開機後會掉。

## 任務決策樹

### 首次部署（新 Mac mini 從零開始）

1. 依 `RUNBOOK.md`「First-time deploy」章節完成：Node/pnpm/PM2 install、`.env.production` 填值、`service-account.json` 放 `~/.config/namecard/`
2. `pnpm install --prod=false`（build 需要 dev dep）
3. `NAMECARD_BASE_PATH=/namecard-web pnpm build`
4. `docker compose -f docker-compose.prod.yml up -d`（Typesense）
5. `pm2 start ecosystem.config.cjs --env production`
6. `pm2 save` — **不能漏**
7. 補 Tailscale serve 映射到 `tailscale-serve-setup.sh`（見上面「開機自恢復鏈」），跑一次驗證
8. Firebase Console 加 authorized domain（見 pitfall #3）
9. 跑驗證流程（見下）

### 重開機後系統恢復

通常自動即可。若有問題，依序檢查：

```bash
# 1) Tailscale daemon
tailscale status                                     # 應 online
# 若 stopped：開 Tailscale.app 讓它 login

# 2) Tailscale serve mappings
tailscale serve status | grep namecard-web           # 應有 /namecard-web 一行
# 若缺：bash /Users/openclaw/.openclaw/bin/tailscale-serve-setup.sh
#       tail -20 /Users/openclaw/.openclaw/logs/tailscale-serve-setup.log  # 看錯誤

# 3) PM2 processes
pm2 list | grep namecard-web                         # 應 online uptime > 0
# 若 stopped 或缺：pm2 resurrect

# 4) Typesense container
docker ps --filter name=namecard-typesense           # 應 Up
# 若缺：cd 到專案 && docker compose -f docker-compose.prod.yml up -d

# 5) End-to-end probe
curl -skL -o /dev/null -w "HTTP %{http_code} final=%{url_effective}\n" \
  https://mac-mini.tailde842d.ts.net/namecard-web/
# 預期: HTTP 200 final=.../namecard-web/login
```

### 修改程式碼 / merge 後重部署

**CRITICAL**: 在 PM2 live `.next/` 上 rebuild 有競態風險。建議流程：

```bash
# 在專案根
cd /Users/openclaw/.openclaw/shared/projects/namecard-web
git pull --ff-only origin main
pnpm install --prod=false

# build 必須帶 basePath（見 pitfall #1）
NAMECARD_BASE_PATH=/namecard-web pnpm build

# zero-downtime reload（比 restart 更好）
pm2 reload namecard-web --update-env

# 驗證
curl -s -o /dev/null -w "local %{http_code}\n" http://127.0.0.1:3014/namecard-web/api/health
curl -skL -o /dev/null -w "public %{http_code}\n" https://mac-mini.tailde842d.ts.net/namecard-web/

# 看新 log 有無 error（看前 2 分鐘）
pm2 logs namecard-web --lines 40 --nostream --err | tail -20
```

### 驗證清單（完整五點健檢）

直接跑現成腳本：

```bash
bash scripts/verify-deploy.sh    # 5-point: PM2 / Docker / Next health / Tailscale serve / Typesense
```

## Pitfalls（踩過的坑，按優先順序）

### 1. build 必須帶 `NAMECARD_BASE_PATH`

**症狀**: `/login` 回 HTTP 500 `TypeError: d.Root._configure is not a function`（protobufjs/firebase bundle 錯亂）。
**根因**: `basePath` 是 **build-time** 注入 chunk 路徑。`pnpm build`（無 env）會產出 basePath 為空的 bundle，和 PM2 runtime `NAMECARD_BASE_PATH=/namecard-web` 不一致。
**解法**: 永遠用 `NAMECARD_BASE_PATH=/namecard-web pnpm build`。若 `.next/` 已被污染，`rm -rf .next` 再 build。
**預防**: 若要 smoke test PR build，**不要**在專案根跑 `pnpm build` — 用 `git worktree add` 開獨立 worktree build，或跑 `pnpm typecheck + pnpm test` 把 build 驗證留給 CI。

### 2. Tailscale serve 映射重開機後消失

**症狀**: `tailscale serve status` 清單缺 `/namecard-web`（或全都沒）。
**根因**: Tailscale serve state 存在 tailnet 節點上，但依 daemon 生命週期可能被清空。
**解法**: 編輯 `/Users/openclaw/.openclaw/bin/tailscale-serve-setup.sh` 把映射列進去（已完成）。重開後 `com.openclaw.tailscale-serve` LaunchAgent 會延遲 30 秒自動跑。手動跑：`bash /Users/openclaw/.openclaw/bin/tailscale-serve-setup.sh`。
**預防**: 新增任何 sub-path 映射時，**必須**同步改這支腳本並跑一次驗證。

### 3. Firebase `auth/unauthorized-domain`

**症狀**: 登入頁選 Google 後彈 `Firebase: Error (auth/unauthorized-domain)`。
**根因**: Firebase Auth 白名單只認 `localhost` + Firebase Hosting domain，不認 Tailscale domain。
**解法**: https://console.firebase.google.com/project/namecard-web-prd/authentication/settings → Authorized domains → Add `mac-mini.tailde842d.ts.net`。這是 Firebase Console 手動設定，沒有 CLI / API 可 autonomously 改。
**預防**: 新增任何對外 domain（含 Tailscale Funnel、自定義 DNS）時要同步加。

### 4. `pm2 save` 漏了

**症狀**: 重開機後 PM2 回來了，但缺 `namecard-web` process（因為 `~/.pm2/dump.pm2` 是舊的）。
**解法**: 每次 `pm2 start/restart/reload` 改變 process 清單後跑 `pm2 save`。
**檢查**: `stat -f "%Sm" ~/.pm2/dump.pm2` 看最後存檔時間是否對得上最近的改動。

### 5. `ecosystem.config.cjs` 寫死 port 3014

PR `9fe4912` 把 3013 改 3014 因為家計本佔了 3013。若哪天 3014 也被佔：改 `ecosystem.config.cjs` `PORT`、同步改 `tailscale-serve-setup.sh` 的 `/namecard-web` 映射、同步更新 `RUNBOOK.md`、`scripts/verify-deploy.sh`、CI `.github/workflows/*.yml`。grep：`grep -r "3014" . --include="*.cjs" --include="*.yml" --include="*.md" --include="*.sh"`。

### 6. Firestore indexes: 沒 deploy 或 queryScope 錯

**症狀 A（沒部署）**: 登入後任何頁面回 500，log 顯示 `FAILED_PRECONDITION: The query requires an index. You can create it here: ...`
**症狀 B（scope 錯）**: `firestore.indexes.json` 已部署、`firebase firestore:indexes` 有顯示 index，但 query 仍回同樣錯誤。

**根因**:

- A: repo 的 `firestore.indexes.json` 沒用 `firebase deploy` 推到 prod。CI 只跑 emulator，不 auto-deploy。
- B: **`queryScope` 不匹配**。Firestore index 有兩種 scope：
  - `COLLECTION`（若 JSON 沒指定的預設值）— 用於 `db.collection(path)` query
  - `COLLECTION_GROUP` — 用於 `db.collectionGroup(name)` query

  本 repo 因「collection-path invariant」(`workspaces/{wid}/cards/{cardId}`) 跨 workspace 讀必須用 collection group query（`db.collectionGroup("cards").where(...)`），所以 **所有 `cards` 和 `tags` 的 composite index 都必須 `queryScope: COLLECTION_GROUP`**。Firebase CLI 在 JSON 沒寫 scope 時靜默套 `COLLECTION`，部署會成功但 runtime 仍缺 index。

**解法**:

```bash
# 1. 確認 firestore.indexes.json 每個需要 collection-group query 的 index 都有
#    "queryScope": "COLLECTION_GROUP"
grep -rn "\.collectionGroup(" src/ --include="*.ts"   # 每個這種 query 都要有對應 COLLECTION_GROUP index

# 2. Deploy
pnpm exec firebase deploy --only firestore:indexes --project namecard-web-prd

# 3. 新 index 進 CREATING state，collection group index 首次建立要全 scan 子集合，
#    空資料 1-5 分鐘。查狀態（Firebase MCP）：
#    firestore_list_indexes parent=projects/namecard-web-prd/databases/(default)/collectionGroups/cards
#    或 Console: https://console.firebase.google.com/project/namecard-web-prd/firestore/indexes
#    等所有需要的 index state=READY 後 query 才會成功
```

**預防**:

- 新增 composite query 時，若用 `db.collectionGroup(...)`，`firestore.indexes.json` 必設 `"queryScope": "COLLECTION_GROUP"`
- 每次 `firestore.indexes.json` 改動後 deploy，用 `firestore_list_indexes` MCP 確認 state=READY
- 清掉舊 COLLECTION-scope 殘留：`firebase deploy ... --force`（會刪除 JSON 中未列的 index）

### 7. `pnpm build` 的 "multiple lockfiles" warning

**症狀**: build log 出現 `Next.js inferred your workspace root ... selected .../package-lock.json`。
**影響**: 無害（不影響 runtime），只影響 standalone output 的 file tracing — 我們沒用 standalone，可忽略。真要消掉：在 `next.config.ts` 加 `outputFileTracingRoot: __dirname`。

## 快速指令字典

| 做什麼                     | 指令                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| 看總體健康                 | `bash scripts/verify-deploy.sh`                                                               |
| 看 PM2 狀態                | `pm2 list \| grep namecard-web`                                                               |
| 看 runtime log（含 error） | `pm2 logs namecard-web --lines 50 --nostream --err`                                           |
| 看 stdout log              | `pm2 logs namecard-web --lines 20 --nostream --out`                                           |
| 看 Tailscale 路由表        | `tailscale serve status`                                                                      |
| 重載 Tailscale 所有映射    | `bash /Users/openclaw/.openclaw/bin/tailscale-serve-setup.sh`                                 |
| 本機 health probe          | `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3014/namecard-web/api/health`      |
| 外部 health probe          | `curl -skL -o /dev/null -w "%{http_code}\n" https://mac-mini.tailde842d.ts.net/namecard-web/` |
| 看 Typesense               | `docker ps --filter name=namecard-typesense`                                                  |
| zero-downtime 重載         | `pm2 reload namecard-web --update-env`                                                        |
| 強制重起（cold）           | `pm2 restart namecard-web --update-env`                                                       |
| 完整重 build               | `rm -rf .next && NAMECARD_BASE_PATH=/namecard-web pnpm build`                                 |
| 持久化 PM2 清單            | `pm2 save`                                                                                    |

## 當你（agent）接手時的 checklist

如果 user 說「檢查部署」「網站掛了」「重開後怪怪的」「不能登入」：

1. **先做非侵入式觀察**（不 restart、不 build）：
   - `pm2 list | grep namecard-web`
   - `tailscale serve status | head -15`
   - `curl -skL -o /dev/null -w "%{http_code}\n" https://mac-mini.tailde842d.ts.net/namecard-web/`
   - `pm2 logs namecard-web --lines 30 --nostream --err | tail -15`
2. **定位到 pitfall 表**，用匹配的 symptom 找根因
3. **小步修復**：能用 reload 就別 restart；能用 setup 腳本就別手動 `tailscale serve --set-path`
4. **修完驗證**：三個 curl（local health / local login / public URL）全 200 才算結案
5. **同步持久化**：若改了 PM2 或 Tailscale 映射 → `pm2 save` + 確認 `tailscale-serve-setup.sh` 同步改到

## 手動交接清單（Phase 7 acceptance criteria，需 user 執行）

這些動作需要 credentials 或 Console 權限，agent 無法 autonomously 做：

- [ ] `.env.production` 從 `.env.production.example` 填值（Firebase public config、`SESSION_SECRET`、`MINIMAX_API_KEY`、`TYPESENSE_API_KEY`、`ALLOWED_EMAILS`）
- [ ] `service-account.json` 放 `~/.config/namecard/` 並 `chmod 600`
- [ ] Firebase Console 加 authorized domain `mac-mini.tailde842d.ts.net`（見 pitfall #3）
- [ ] GCS backup bucket 建立 + 30-day lifecycle，填 `scripts/backup-firestore.sh`
- [ ] `launchctl` 排 `scripts/backup-firestore.sh` 每日（建議 `ai.namecard.backup.plist`）
- [ ] UptimeRobot HTTPS 探測 + Telegram Bot 告警
- [ ] Google Cloud Budget $10/月 alert
- [ ] `service-account.json` + API keys 存 1Password
- [ ] DR drill（restore from backup 到 secondary project）
