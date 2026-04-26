# UX Audit Report — namecard-web 商務人士使用者旅程

**Date**: 2026-04-26
**Auditor**: Claude (background-agent), instructed by openclaw
**Scope**: 8 core capture/triage journeys (A–H) defined in `e2e/journeys/business-user-flows.json`
**Method**: Code-grounded static analysis of `src/app/(app)/**`, `src/components/shell/**`, `src/components/home/**`, plus an attempted Playwright pass.

> **⚠️ Live Playwright run aborted at journey A**: The MCP browser instance hit `/login` because no `__nc_session` cookie was present in this isolated browser profile. The user's signed-in session lives in their own browser, not in MCP's headless one. **Per task instructions, this report is grounded in code-level analysis** (which conclusively answers all 8 journeys' "is the entry point reachable?" question — that was the audit's primary concern).
>
> A future live run requires either: (a) a service-account auth-bypass for `mac-mini.tailde842d.ts.net`, (b) a pre-warmed Playwright profile dir with the session cookie copied in, or (c) an env-flagged dev-mode that auto-mocks `readSession`. Any of those is a separate task — flagging it here so it doesn't get lost.

---

## 1. 嚴重缺口 — 孤兒頁 / 必須輸入網址才到得了

### 缺口 #1: `/cards/scan` 是孤兒頁（除了 zero-state 之外完全找不到）

**Evidence**:

- `src/components/shell/AppShell.tsx:18-34` (PRIMARY 15 entries) — **沒有** `/cards/scan`
- `src/components/shell/MobileFab.tsx:73-91` (4 actions: 對話速記 / 語音建卡 / 找人 / 追蹤) — **沒有** scan
- `src/app/(app)/page.tsx:60-76` (home `quickActions`) — 只有 對話速記 + 語音建卡，**沒有** scan
- `src/components/home/OnboardingHero.tsx:14-44` (PATHS 4 entries) — **有** scan，**但** OnboardingHero 只在 `cards.length === 0` 才 render（見 `page.tsx:80`）

**結果**: 用戶從第 2 張名片開始，永遠看不到「拍照建檔」入口。這正是 user 的觸發訊號（"如何用照相建檔名片？"）—— 功能存在 (`src/components/scan/ScanFlow.tsx` 健全)，但路徑被切斷。

**Impact**: HIGH。OCR 是商務名片場景最高頻的 capture 路徑（剛從 networking event 回來，桌上一疊紙卡）。把它藏起來等於把這個 use case 踢掉。

**Suggested GitHub Issue draft**:

- **Title**: `feat(home): surface 拍照建檔 (/cards/scan) entry from main timeline + MobileFab`
- **Body**:
  > `/cards/scan` works fine but has zero discoverable entry once the user has any cards (OnboardingHero is hidden when `cards.length > 0`). Add it to:
  >
  > 1. `src/app/(app)/page.tsx` `quickActions` row (alongside 🎙️ 語音建卡)
  > 2. `src/components/shell/MobileFab.tsx` action sheet (replace one of the existing four or expand to 5)
  > 3. `src/components/shell/AppShell.tsx` `PRIMARY` rail (between 新增 and 🎙️ 語音建卡)
  >
  > Suggested copy: `📷 拍照建檔` / `掃名片自動填欄`
  >
  > Acceptance: from `/`, user reaches `/cards/scan` in ≤ 2 clicks without typing the URL. E2E test in `e2e/journeys/` covering A_photo_capture passes.

---

### 缺口 #2: `/recap`、`/prep`、`/intros`、`/stats` 只有 rail 入口（行動裝置進不去 FAB）

**Evidence**:

- `MobileFab.tsx` 只暴露 4 個動作（對話速記/語音建卡/找人/追蹤）—— 在 mobile 上其他 11 個 PRIMARY 項目得從漢堡選單抽屜拿，**新功能不會觸到 mobile 用戶眼睛**。
- 過去 28 個 PR polish 了大量這類功能可見性 (recap、prep、intros、stats)，但 mobile 路徑沒人 audit。

**Impact**: MEDIUM-HIGH。mobile 是場合中最自然的使用情境（剛交換完名片）；新增的「對話日誌」「會議準備」「介紹建議」「儀表板」在 mobile 上沒有 affordance。

**Suggested GitHub Issue draft**:

- **Title**: `feat(mobile): MobileFab needs second tier or strategy for 11 hidden PRIMARY routes`
- **Body**:
  > MobileFab currently surfaces only 4 / 15 PRIMARY items. With Phase 5/6 PRs adding 4+ new routes (`/recap`, `/prep`, `/intros`, `/stats`), the mobile user can no longer discover them without opening the drawer. Decide:
  >
  > - (a) Bottom-sheet "more" overflow that mirrors PRIMARY rail
  > - (b) Per-route mobile-first cards on `/` home below the timeline
  > - (c) Tab bar (5 most-used) replacing FAB
  >
  > Don't add scan to FAB without resolving this — the FAB will overflow.

---

## 2. 點擊次數超標

> All journeys' click budgets were hand-counted from the static nav structure (no live run available). The AppShell rail puts every PRIMARY route at depth 1, so most journeys hit their budget. The exceptions:

### Journey A 拍照建檔 — **❌ FAIL (∞ clicks)**

- Nav chain: 完全沒有可點的入口，必須輸入 URL → infinite clicks
- See 缺口 #1. **Blocking**.

### Journey G 編輯一張卡 — **3 clicks (within budget)**

- `/cards` (rail) → 點某張卡 → `/cards/[id]` 上的「編輯」按鈕 (`CardActions.tsx:434`) → `/cards/[id]/edit`
- Note: there's both a dedicated edit route AND `CardInlineEdit.tsx` — confirm which one users actually trigger by default. If both exist as redundant paths it's a small friction (which one is "save"?). Worth a quick UX call.

### Journey F Triage — **3 clicks (within budget)**

- `/` → quickAction `⏰ N 個人該 ping 了` → `/followups` → ✅ 已聯絡 → snooze picker
- However `dueRemindersToday()` (followups/page.tsx:39) and `totalFollowups()` are added together at line 44 — verify the home `followupsTotal` chip uses the same total or users will see different counts in two places. (Same-source-of-truth note from CLAUDE.md.)

### Journey H Group view — **3 clicks (within budget)**

- `/` → 公司 (rail) → 點某家 → `/companies/[slug]` 已有溫度分布 + 卡片列表

---

## 3. 小體驗問題 (copy / hover / 視覺)

1. **Rail 上 4 個項目都是 emoji 開頭** (🤝/🎙️/🗣️/📓/📅/📊)，但「時間軸」「追蹤」「名片冊」「新增」「公司」「場合」「標籤」「匯入」「成員」沒有。視覺上不一致 — 要嘛全加要嘛全減。建議全減（emoji 在 description 裡用 sparingly），讓 rail 更乾淨；或全部統一加（一個 functional category 一個 emoji）。

2. **Home quickActions** 排序是 `⏰ followups (urgent) → 對話速記 → 語音建卡`。urgent badge 在最前面是對的，但 urgent 不存在時，第 1 名變成「對話速記」—— 在 zero-state 之外沒有「拍照建檔」+「手動建立」的提示，使用者會以為只有兩條進入路徑。

3. **`PRIMARY` rail 在 desktop 沒有分組** — 14 個項目平鋪一條。建議分成「捕捉 (capture) / 追蹤 (triage) / 查找 (browse) / 設定 (admin)」四群，加分隔線。15 行平鋪在視覺上是 dashboard-by-numbers 反模式（觸發 design-quality.md 的 banned pattern）。

4. **`OnboardingHero` PATHS 順序** 把語音放第 1、scan 放第 2，但商務人士的本能 first-touch 通常是 scan（剛從 event 回來，桌上一疊紙）—— 考慮把 scan 放第 1 + emphasis。或做 A/B 量哪個 conversion 高。

5. **Cmd+K** 快捷鍵在 SearchBox 有實作 (`SearchBox.tsx:48-58`)，但鍵盤提示在 UI 裡不可見（沒有 `⌘K` 標籤）。Mac 用戶看不到 = 沒人會用。SearchBox host 應該渲染 `<kbd>⌘K</kbd>` placeholder。

---

## 4. 流程順暢的部分（不要改壞）

1. **`/followups` 的 ✅ 已聯絡 + 提醒 picker** (`followups/page.tsx:62`) 文案清楚（"按急迫度排序，點 ✅ 已聯絡 會把這個人從清單裡拿掉"）—— 這是少見的 in-context teaching，保留。

2. **`countFollowupsInCards` 是單一來源** (page.tsx:36, AppShell rail badge, MobileFab badge, home quickAction chip 都讀同一個值) —— 跨頁 badge 同步靠這個。改它要小心。

3. **`/companies/[slug]` 已有 cross-link 回 `/followups` 跟 `/events/[tag]`** (lines 76, 87) —— H journey 的 group view 有完整 lateral navigation，這比很多 SaaS dashboard 還好。

4. **`OnboardingHero` 設計很對** —— 4 條捕捉路徑平排（不是 single CTA），對齊 design-quality.md「intentional rhythm in spacing」。問題只是它在 `cards.length > 0` 之後消失，把 scan 帶下水。

5. **MobileFab 的 ✕ + backdrop dismiss + Esc** (`MobileFab.tsx:38, 57`) 該有的 dismiss 都有，無障礙 `role="menu"` + `aria-expanded` 都到位。新增 action 不要破壞這個結構。

---

## 結論

**Headline**: `/cards/scan` 確診孤兒頁，user 直覺是對的。連帶發現 mobile 對 11 / 15 PRIMARY 路由 的 affordance gap。建議**先開 1 個 P0 issue 修缺口 #1**（簡單、無爭議、解 user 提問的根因），再開 **1 個 P1 spike** 釐清缺口 #2 的 mobile 策略（牽涉 IA 決策，不該 hot-fix）。第 3、4 節的小問題彙總開 1 張 quality issue。

---

## Appendix: 路由總覽

| 路由                 | rail           | quickAction     | FAB             | OnboardingHero      | 結論                                                |
| -------------------- | -------------- | --------------- | --------------- | ------------------- | --------------------------------------------------- |
| `/`                  | ✓              | —               | —               | —                   | OK                                                  |
| `/followups`         | ✓ (with badge) | ✓ (conditional) | ✓ (conditional) | —                   | OK                                                  |
| `/intros`            | ✓              | —               | —               | —                   | OK (rail only)                                      |
| `/cards`             | ✓              | —               | —               | —                   | OK                                                  |
| `/cards/new`         | ✓              | —               | —               | ✓ (zero state)      | OK                                                  |
| `/cards/voice`       | ✓              | ✓               | ✓               | ✓ (zero state)      | OK                                                  |
| `/cards/scan`        | **✗**          | **✗**           | **✗**           | ✓ (zero state ONLY) | **❌ 缺口 #1**                                      |
| `/cards/duplicates`  | —              | —               | —               | —                   | reachable from `/cards` (OK)                        |
| `/cards/[id]`        | —              | —               | —               | —                   | reachable from any card list (OK)                   |
| `/cards/[id]/edit`   | —              | —               | —               | —                   | reachable from `CardActions` (OK)                   |
| `/log`               | ✓              | ✓               | ✓               | —                   | OK                                                  |
| `/recap`             | ✓              | —               | —               | —                   | OK on desktop, mobile-hidden                        |
| `/prep`              | ✓              | —               | —               | —                   | OK on desktop, mobile-hidden                        |
| `/stats`             | ✓              | —               | —               | —                   | OK on desktop, mobile-hidden                        |
| `/companies`         | ✓              | —               | —               | —                   | OK                                                  |
| `/companies/[slug]`  | —              | —               | —               | —                   | reachable from `/companies` (OK)                    |
| `/events`            | ✓              | —               | —               | —                   | OK                                                  |
| `/events/[tag]`      | —              | —               | —               | —                   | reachable from `/events` + `/companies/[slug]` (OK) |
| `/tags`              | ✓              | —               | —               | —                   | OK                                                  |
| `/import`            | ✓              | —               | —               | ✓ (zero state)      | OK                                                  |
| `/workspace/members` | ✓              | —               | —               | —                   | OK                                                  |
| `/admin/reindex`     | —              | —               | —               | —                   | intentional (admin only, not user-facing)           |
