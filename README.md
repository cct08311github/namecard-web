# namecard-web

> 個人工作名片管理網站 — 以「關係脈絡」為核心，對抗 iOS 17+ 內建名片掃描的差異化工具。

## 🎯 專案定位

這不是又一個名片掃描 app。現成工具（iOS 相機、Covve、CamCard）都解決「拍照 → 存檔」，但沒有人解決：

- **「我為什麼記得這個人」**（必填一句話）
- **「最近沒聯絡的人」**（時間軸首頁）
- **「2024 COMPUTEX 認識的所有人」**（見面場合結構化搜尋）

本專案把「關係脈絡」做成第一等公民。

## 🏗️ 技術棧

| 層   | 選擇                                                                         |
| ---- | ---------------------------------------------------------------------------- |
| 框架 | Next.js 16 App Router + TypeScript + Tailwind v4 + CSS Modules               |
| Auth | Firebase Auth（Google Provider）+ email whitelist                            |
| 資料 | Firestore（`workspaces/{wid}/cards/{cardId}` + `memberUids[]` denormalized） |
| 儲存 | Firebase Storage（UUID filename + 15-min Signed URL）                        |
| OCR  | MiniMax M2.7（主）/ GPT-4o Vision（備）透過 `OcrProvider` interface          |
| 搜尋 | Typesense self-hosted on Mac mini Docker（CJK tokenizer）                    |
| 部署 | Mac mini M4 + PM2 + Tailscale Serve（MagicDNS + HTTPS）                      |
| 監控 | UptimeRobot 外部 + Telegram Bot 告警                                         |
| 備份 | 每日 `gcloud firestore export` cron + Storage Object Versioning              |
| 測試 | Vitest + Playwright，coverage ≥ 80%                                          |

## 🎨 設計方向

**Editorial × 日式極簡**（Kinfolk 雜誌式版型 + 米白墨黑 + 朱紅強調色）。刻意避開 shadcn / Tailwind 預設樣板感。

## 🚀 Dev Setup

### 需求

- Node 22+（`.nvmrc`）
- pnpm 10+
- Docker（供本機 Typesense）

### 安裝

```bash
pnpm install
cp .env.example .env.local
# 填入 Firebase / MiniMax / OpenAI credentials
pnpm dev
```

開啟 `http://localhost:3000`。

### 常用指令

```bash
pnpm dev                # 開發伺服器
pnpm build              # 產製 production bundle
pnpm start              # 啟動 production server
pnpm test               # 單元測試
pnpm test:coverage      # 覆蓋率報告
pnpm test:e2e           # Playwright E2E
pnpm typecheck          # TypeScript 型別檢查
pnpm lint               # ESLint
pnpm format:fix         # Prettier 格式化

# Typesense（Phase 4 搜尋）
pnpm search:up          # docker compose up -d typesense
pnpm search:bootstrap   # 建立 cards collection（idempotent）
pnpm search:down        # 關閉並回收 volume
```

## 📂 目錄結構（規劃中）

```
src/
├── app/                   # Next.js App Router
│   ├── (auth)/            # 登入流程
│   ├── (app)/             # 已登入區域
│   │   ├── cards/         # 名片 CRUD
│   │   ├── tags/          # 標籤管理
│   │   └── page.tsx       # 首頁（關係時間軸）
│   └── api/
│       └── health/        # 健康檢查
├── components/            # UI components
├── lib/
│   ├── firebase/          # Firebase SDK boundary（server / client）
│   ├── ocr/               # OCR provider interface
│   ├── vcard/             # vCard import/export
│   └── search/            # Typesense client
├── db/                    # Firestore schema / data converters
├── styles/                # Design tokens + global CSS
└── test/                  # Vitest setup
```

## 🧭 開發流程

見 [CONTRIBUTING.md](./CONTRIBUTING.md)。每個 feature 對應一個 GitHub Issue → branch → PR。

## 📋 Roadmap

- [x] Phase 0：Scaffold + docs + CI
- [ ] Phase 1：Foundation（Firebase + schema + rules + design tokens）
- [ ] Phase 2：Auth + Manual CRUD + 時間軸首頁（**MVP 上線點**）
- [ ] Phase 3：OCR 拍照 + 校對 UI
- [ ] Phase 4：Typesense 搜尋 + 標籤
- [ ] Phase 5：vCard/CSV/LinkedIn 匯入 + 標籤自動建議
- [ ] Phase 6：Workspace 邀請 UI
- [ ] Phase 7：部署 + 監控 + RUNBOOK

## 📜 License

MIT — 見 [LICENSE](./LICENSE)
