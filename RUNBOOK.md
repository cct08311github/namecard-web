# namecard-web 運維手冊 (RUNBOOK)

> 目標 URL：**https://mac-mini.tailde842d.ts.net/namecard-web/**
> 機器：Mac mini M4（macOS Darwin 25.x）
> 管理帳號：openclaw

---

## 目錄

1. [服務架構總覽](#1-服務架構總覽)
2. [首次部署（First-time Deploy）](#2-首次部署)
3. [常規部署（git pull → rebuild → reload）](#3-常規部署)
4. [健康檢查](#4-健康檢查)
5. [常見問題排查](#5-常見問題排查)
6. [備份與還原](#6-備份與還原)
7. [災難還原（RTO < 2h）](#7-災難還原)
8. [常用指令速查](#8-常用指令速查)

---

## 1. 服務架構總覽

```
Tailscale MagicDNS (HTTPS)
  └── mac-mini.tailde842d.ts.net/namecard-web/*
        │
        ▼
  tailscale serve (TLS termination + path routing)
        │
        ▼
  localhost:3013  ← PM2: namecard-web (Next.js)
        │
        ├── Firebase Admin SDK → Firestore / Auth / Storage (namecard-web-prd)
        └── localhost:8108    ← Docker: namecard-typesense
```

| 元件       | 管理工具                      | Port                     |
| ---------- | ----------------------------- | ------------------------ |
| Next.js    | PM2 (`namecard-web`)          | 3013                     |
| Typesense  | Docker (`namecard-typesense`) | 127.0.0.1:8108           |
| TLS + 路由 | Tailscale Serve               | 443 (public via tailnet) |
| Firebase   | Google Cloud (外部)           | —                        |

---

## 2. 首次部署

### 前置條件確認

- [ ] `node --version` ≥ 22
- [ ] `pnpm --version` ≥ 10
- [ ] `pm2 --version` ≥ 6
- [ ] `docker info` 正常（Docker daemon 已啟動）
- [ ] `/usr/local/bin/tailscale status` 已連線至 tailnet
- [ ] Firebase service account JSON 已放至 `~/.config/namecard/service-account.json`
- [ ] `.env.production` 已從 `.env.production.example` 複製並填寫完整

### 步驟

```bash
# 1. Clone（若尚未 clone）
git clone https://github.com/cct08311github/namecard-web.git \
  /Users/openclaw/.openclaw/shared/projects/namecard-web
cd /Users/openclaw/.openclaw/shared/projects/namecard-web

# 2. 安裝依賴
pnpm install

# 3. 建立 production env（第一次需手動填入）
cp .env.production.example .env.production
# → 開啟 .env.production，填入所有空值（見 .env.production.example 說明）

# 4. 啟動 Typesense container
docker compose -f docker-compose.prod.yml \
  --env-file .env.production up -d

# 5. 建置 Next.js
NAMECARD_BASE_PATH=/namecard-web pnpm build

# 6. 啟動 PM2（載入 .env.production 環境變數）
set -a; source .env.production; set +a
pm2 start ecosystem.config.cjs --env production
pm2 save

# 7. 確保 PM2 跟隨系統啟動（只需執行一次）
pm2 startup launchd
# → 依照輸出的指令貼上執行（通常需要 sudo）

# 8. 設定 Tailscale Serve 路由
tailscale serve --bg --set-path=/namecard-web http://localhost:3013

# 9. 健康檢查
scripts/verify-deploy.sh
```

---

## 3. 常規部署

每次 `git pull` 後執行以下步驟（已有 PM2 管理、Tailscale Serve 已設定）：

```bash
cd /Users/openclaw/.openclaw/shared/projects/namecard-web

# 1. 拉取最新程式碼
git pull origin main

# 2. 更新依賴（package.json 有變動時）
pnpm install

# 3. 重新建置
NAMECARD_BASE_PATH=/namecard-web pnpm build

# 4. 零停機重載（PM2 fork mode）
pm2 reload namecard-web

# 5. 驗證
scripts/verify-deploy.sh
```

---

## 4. 健康檢查

執行一鍵檢查腳本：

```bash
scripts/verify-deploy.sh
```

腳本會依序確認：

1. PM2 `namecard-web` 狀態為 online
2. Docker `namecard-typesense` container 正在執行
3. `http://localhost:3013/namecard-web/api/health` 回應 HTTP 200
4. `tailscale serve status` 包含 `/namecard-web` 路由
5. `http://127.0.0.1:8108/health` 回應 `{"ok":true}`

---

## 5. 常見問題排查

### Next.js 啟動失敗

```bash
pm2 logs namecard-web --lines 100
```

常見原因：

| 症狀                                       | 排查                                                   |
| ------------------------------------------ | ------------------------------------------------------ |
| `PORT 3013 already in use`                 | `lsof -i :3013` 找出佔用 PID → `kill <PID>`            |
| `GOOGLE_APPLICATION_CREDENTIALS not found` | 確認 `.env.production` 中路徑正確且檔案存在            |
| `SESSION_COOKIE_SECRET too short`          | 確認 secret ≥ 32 字元                                  |
| `basePath` 資源 404                        | 確認 build 時有設定 `NAMECARD_BASE_PATH=/namecard-web` |

### Typesense container 停止

```bash
docker logs namecard-typesense --tail 50
docker compose -f docker-compose.prod.yml \
  --env-file .env.production up -d
```

常見原因：`TYPESENSE_API_KEY` 未設定、`.typesense-data-prod/` 權限問題（`chmod 755 .typesense-data-prod`）。

### Tailscale Serve 路由不存在

```bash
# 查看現有 serve 設定
tailscale serve status

# 重新設定
tailscale serve --bg --set-path=/namecard-web http://localhost:3013

# 驗證
curl -s https://mac-mini.tailde842d.ts.net/namecard-web/api/health
```

### Session Cookie 失效（用戶被踢出）

Firebase session cookie 預設有效期為 14 天。若大量用戶同時失效，確認：

- `SESSION_COOKIE_SECRET` 未被意外變更
- Firebase Auth 服務狀態：https://status.firebase.google.com/

### Firestore 認證失敗（Admin SDK）

```bash
# 測試 service account 是否有效
gcloud auth activate-service-account \
  --key-file ~/.config/namecard/service-account.json
gcloud firestore operations list \
  --project=namecard-web-prd
```

若 service account 金鑰過期，至 Firebase Console → Project Settings → Service Accounts 重新產生。

---

## 6. 備份與還原

### 備份位置

- **Firestore**：GCS bucket `gs://namecard-backup-namecard-web-prd/firestore/<timestamp>/`
- **Storage**：Firebase Storage 已啟用 Object Versioning（不需另外備份）

### 手動觸發備份

```bash
scripts/backup-firestore.sh
```

> ⚠️ 首次使用前需先依 `scripts/backup-firestore.sh` 頂端 TODO 完成 GCS bucket 設定。

### 排程備份（launchd）

每日 02:00 自動執行（plist 範例待建立）。

### 從備份還原 Firestore

```bash
# 列出可用備份
gsutil ls gs://namecard-backup-namecard-web-prd/firestore/

# 還原指定快照（會覆蓋現有資料，操作前確認）
gcloud firestore import gs://namecard-backup-namecard-web-prd/firestore/<timestamp>/ \
  --project=namecard-web-prd
```

---

## 7. 災難還原

目標：**RTO < 2 小時**

### 情境：Mac mini 需重建（新機或系統重裝）

```bash
# 1. 從 1Password 取回以下機密：
#    - ~/.config/namecard/service-account.json
#    - .env.production 內容

# 2. 安裝必要工具
brew install node pnpm
npm install -g pm2@latest

# 3. Clone 程式碼
git clone https://github.com/cct08311github/namecard-web.git \
  /Users/openclaw/.openclaw/shared/projects/namecard-web
cd /Users/openclaw/.openclaw/shared/projects/namecard-web

# 4. 還原 service account + env
mkdir -p ~/.config/namecard
# → 從 1Password 貼上 service-account.json
# → 從 1Password 貼上 .env.production

# 5. 安裝依賴 + 建置
pnpm install
NAMECARD_BASE_PATH=/namecard-web pnpm build

# 6. 啟動 Typesense
docker compose -f docker-compose.prod.yml \
  --env-file .env.production up -d

# 7. 啟動 PM2
set -a; source .env.production; set +a
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup launchd

# 8. Tailscale Serve
tailscale serve --bg --set-path=/namecard-web http://localhost:3013

# 9. 驗證
scripts/verify-deploy.sh
```

### 機密存放（1Password）

| 項目                  | 1Password Vault | 備注                     |
| --------------------- | --------------- | ------------------------ |
| service-account.json  | namecard-web    | Firebase Admin SDK 金鑰  |
| .env.production       | namecard-web    | 所有 production 環境變數 |
| SESSION_COOKIE_SECRET | namecard-web    | 32+ 字元隨機值           |
| TYPESENSE_API_KEY     | namecard-web    | Typesense admin key      |

---

## 8. 常用指令速查

### PM2

```bash
pm2 list                          # 查看所有 process 狀態
pm2 logs namecard-web             # 即時 log（Ctrl-C 離開）
pm2 logs namecard-web --lines 200 # 最後 200 行 log
pm2 reload namecard-web           # 零停機重啟（production 改版用）
pm2 restart namecard-web          # 強制重啟
pm2 stop namecard-web             # 停止
pm2 delete namecard-web           # 從 PM2 移除
pm2 save                          # 儲存 process 列表（供 startup 使用）
```

### Docker / Typesense

```bash
docker compose -f docker-compose.prod.yml \
  --env-file .env.production up -d      # 啟動 Typesense
docker compose -f docker-compose.prod.yml down   # 停止（保留資料）
docker logs namecard-typesense -f        # 即時 log
docker exec -it namecard-typesense sh    # 進入 container shell
```

### Tailscale

```bash
tailscale serve status                  # 查看 serve 設定
tailscale serve --bg --set-path=/namecard-web http://localhost:3013
tailscale serve --https=443 off         # 移除所有 serve（謹慎使用）
```

### Firebase

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
npx firebase deploy --only storage
```

### 快速驗證

```bash
scripts/verify-deploy.sh
# 或手動
curl -s http://localhost:3013/namecard-web/api/health
curl -s http://127.0.0.1:8108/health
pm2 list
docker ps | grep namecard
```
