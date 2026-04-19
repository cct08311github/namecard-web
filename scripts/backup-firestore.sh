#!/usr/bin/env bash
# ============================================================
# scripts/backup-firestore.sh
# 每日 Firestore + Storage 匯出到 GCS bucket
#
# 需求：
#   - gcloud CLI 已安裝且以 owner 身份認證（gcloud auth login）
#   - GCS bucket: namecard-backup-${PROJECT_ID}
#     建立指令：
#       gsutil mb -l asia-east1 gs://namecard-backup-namecard-web-prd
#       gsutil lifecycle set scripts/gcs-lifecycle-30d.json gs://namecard-backup-namecard-web-prd
#   - bucket 需設定 30-day 自動清理 lifecycle（見 scripts/gcs-lifecycle-30d.json）
#
# 建議呼叫方式（launchd plist 每日 02:00 執行）：
#   參考 docs/deployment/com.namecard.backup.plist.example
#
# 用法：
#   scripts/backup-firestore.sh
#
# TODO（Phase 7 手動步驟）：
#   1. 在 Google Cloud Console 建立 GCS bucket
#   2. 設定 30-day lifecycle policy
#   3. 授予 service account storage.objectCreator 權限
#   4. 取消下方 TODO 區塊的 exit 0，填入正式 gsutil 指令
# ============================================================

set -euo pipefail

PROJECT_ID="${FIREBASE_ADMIN_PROJECT_ID:-namecard-web-prd}"
BUCKET="gs://namecard-backup-${PROJECT_ID}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
EXPORT_PATH="${BUCKET}/firestore/${TIMESTAMP}"

echo "[backup-firestore] $(date '+%Y-%m-%d %H:%M:%S') 開始備份..."
echo "[backup-firestore] Project: ${PROJECT_ID}"
echo "[backup-firestore] Destination: ${EXPORT_PATH}"

# ---- TODO: 啟用以下指令（需先完成 GCS bucket 設定）-----------
# gcloud firestore export "${EXPORT_PATH}" \
#   --project="${PROJECT_ID}" \
#   --async
# echo "[backup-firestore] Firestore 匯出已排入佇列：${EXPORT_PATH}"
# ---------------------------------------------------------------

echo ""
echo "[backup-firestore] ⚠️  尚未設定 GCS bucket — 跳過實際備份"
echo "[backup-firestore] 請依 scripts/backup-firestore.sh 頂端的 TODO 步驟完成設定後"
echo "[backup-firestore] 再取消 gcloud firestore export 指令的注解"
echo ""

exit 0
