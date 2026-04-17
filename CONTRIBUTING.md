# Contributing

## 開發流程

1. **找/建 Issue**：每個 change 都對應一個 GitHub Issue。
2. **標 in-progress**：開始實作前加 `in-progress` label。
3. **Branch**：`feat/phase-N-<short>` 或 `fix/issue-<N>-<desc>`，從最新 `main` 建立。
4. **TDD**：先寫測試（紅）→ 實作（綠）→ 重構。
5. **本機驗證**：
   ```bash
   pnpm test:coverage
   pnpm typecheck
   pnpm lint
   pnpm format
   pnpm build
   ```
6. **Commit**：`<type>(<phase>): <desc>`（繁中描述 OK）
7. **Push + PR**：PR body 含 `Closes #N`，等 CI 綠再請審。

## Commit 格式

```
feat(phase-2): 新增 Google 登入 middleware
fix(phase-3): 修正 OCR 低信心度欄位無標示
refactor(phase-4): 抽出搜尋 ranking 權重計算
test(phase-1): 補 Firestore Rules 跨 user 測試
docs(readme): 更新 Phase 3 roadmap 狀態
chore(ci): 升級 Playwright 到 1.60
```

Types：`feat` / `fix` / `refactor` / `test` / `docs` / `chore` / `perf` / `ci`

## PR 檢查清單

- [ ] `Closes #N` 寫在 PR body
- [ ] CI 綠（build / test / lint / format / e2e）
- [ ] Coverage ≥ 80%
- [ ] 新功能有 E2E 測試
- [ ] 安全敏感改動請 security-reviewer agent
- [ ] 設計改動自問「能放進 Kinfolk 嗎？」
- [ ] 更新 README Roadmap 狀態

## 分支保護

- `main` 禁止 direct push
- PR 需至少 1 review + CI pass
- 禁止 `--no-verify`、`git push --force` 到 `main`
