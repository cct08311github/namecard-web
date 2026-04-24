"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateCardAction } from "@/app/(app)/cards/actions";
import { scanCardAction } from "@/app/(app)/cards/scan/actions";
import type { CardUpdateInput } from "@/db/schema";
import { countAffectedFields, mergeOcrIntoExisting, type MergeStrategy } from "@/lib/ocr/merge";
import type { OcrFields } from "@/lib/ocr/types";

import styles from "./OcrRescanPanel.module.css";

interface OcrRescanPanelProps {
  cardId: string;
  /**
   * Current (pre-edit) card field snapshot. We only need the fields
   * that can be OCR-filled, in the same shape updateCardAction accepts.
   */
  current: Partial<CardUpdateInput>;
}

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; previewUrl: string }
  | {
      kind: "review";
      previewUrl: string;
      fields: OcrFields;
    }
  | { kind: "ocr-failed"; previewUrl: string; message: string }
  | { kind: "applying" };

/**
 * Disclosure panel on the edit page that lets you upload a fresh
 * photo of a namecard and pull detected fields into the existing
 * record. Two apply modes:
 *   - 只補空欄位 (default / safer) — never overwrites your typing
 *   - 全部覆蓋 — destructive, OCR wins
 */
export function OcrRescanPanel({ cardId, current }: OcrRescanPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [applying, startApply] = useTransition();

  async function handleFile(file: File) {
    setError(null);
    const previewUrl = URL.createObjectURL(file);
    setPhase({ kind: "uploading", previewUrl });

    const fileBase64 = await blobToBase64(file);
    const result = await scanCardAction({
      fileBase64,
      mimeType: file.type || "image/jpeg",
      originalName: file.name,
    });

    if (result?.serverError) {
      setPhase({ kind: "ocr-failed", previewUrl, message: result.serverError });
      return;
    }
    if (result?.validationErrors) {
      setPhase({
        kind: "ocr-failed",
        previewUrl,
        message: "上傳格式不符（>10MB 或非圖片）",
      });
      return;
    }

    const data = result?.data;
    if (!data || !data.ok) {
      setPhase({
        kind: "ocr-failed",
        previewUrl,
        message: "OCR 解析失敗，請換一張清晰的圖片再試。",
      });
      return;
    }

    setPhase({ kind: "review", previewUrl, fields: data.fields });
  }

  function handleApply(strategy: MergeStrategy) {
    if (phase.kind !== "review") return;
    const patch = mergeOcrIntoExisting(current, phase.fields, strategy);
    if (Object.keys(patch).length === 0) {
      setError("OCR 沒有可以填入的新欄位。");
      return;
    }
    setPhase({ kind: "applying" });
    setError(null);
    startApply(async () => {
      const result = await updateCardAction({ id: cardId, input: patch });
      if (result?.serverError) {
        setError(result.serverError);
        setPhase({
          kind: "review",
          previewUrl: phaseWithPreview(phase),
          fields: phase.fields,
        });
        return;
      }
      // Success: collapse + refresh so the edit form mounts with new values.
      setOpen(false);
      setPhase({ kind: "idle" });
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        📷 從照片重新解析欄位
      </button>
    );
  }

  return (
    <section className={styles.panel} aria-label="OCR 重新解析">
      <header className={styles.header}>
        <p className={styles.title}>📷 從照片重新解析欄位</p>
        <button
          type="button"
          className={styles.close}
          onClick={() => {
            setOpen(false);
            setPhase({ kind: "idle" });
            setError(null);
          }}
          aria-label="關閉"
        >
          ✕
        </button>
      </header>

      {phase.kind === "idle" && (
        <label className={styles.fileLabel}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className={styles.fileInput}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <span className={styles.fileCta}>選擇或拍攝名片照片</span>
          <span className={styles.hint}>最大 10MB · 會存到 Firebase Storage 並呼叫 OCR</span>
        </label>
      )}

      {phase.kind === "uploading" && (
        <div className={styles.uploadingBox}>
          <Image
            src={phase.previewUrl}
            alt="預覽"
            className={styles.preview}
            width={320}
            height={200}
            unoptimized
          />
          <p className={styles.uploading}>解析中…</p>
        </div>
      )}

      {phase.kind === "review" && (
        <ReviewBody
          previewUrl={phase.previewUrl}
          current={current}
          fields={phase.fields}
          onApply={handleApply}
          disabled={applying}
        />
      )}

      {phase.kind === "applying" && <p className={styles.uploading}>更新中…</p>}

      {phase.kind === "ocr-failed" && (
        <div className={styles.failed}>
          <Image
            src={phase.previewUrl}
            alt="預覽"
            className={styles.preview}
            width={320}
            height={200}
            unoptimized
          />
          <p className={styles.error}>{phase.message}</p>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => setPhase({ kind: "idle" })}
          >
            重試
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}

function ReviewBody({
  previewUrl,
  current,
  fields,
  onApply,
  disabled,
}: {
  previewUrl: string;
  current: Partial<CardUpdateInput>;
  fields: OcrFields;
  onApply: (strategy: MergeStrategy) => void;
  disabled: boolean;
}) {
  const fillEmptyCount = countAffectedFields(current, fields, "fill-empty");
  const overwriteCount = countAffectedFields(current, fields, "overwrite");

  return (
    <div className={styles.review}>
      <Image
        src={previewUrl}
        alt="名片預覽"
        className={styles.preview}
        width={320}
        height={200}
        unoptimized
      />
      <div className={styles.summary}>
        <p className={styles.summaryTitle}>OCR 解析結果</p>
        <ul className={styles.fieldList}>
          {fieldPreviewRow("姓名(中)", fields.nameZh?.value)}
          {fieldPreviewRow("姓名(英)", fields.nameEn?.value)}
          {fieldPreviewRow("職稱", fields.jobTitleZh?.value || fields.jobTitleEn?.value)}
          {fieldPreviewRow("公司", fields.companyZh?.value || fields.companyEn?.value)}
          {fields.phones.length > 0 && (
            <li>
              <span className={styles.fieldLabel}>電話</span>
              <span>{fields.phones.map((p) => p.value).join("、")}</span>
            </li>
          )}
          {fields.emails.length > 0 && (
            <li>
              <span className={styles.fieldLabel}>Email</span>
              <span>{fields.emails.map((e) => e.value).join("、")}</span>
            </li>
          )}
          {fields.social?.lineId?.value && (
            <li>
              <span className={styles.fieldLabel}>LINE</span>
              <span>{fields.social.lineId.value}</span>
            </li>
          )}
        </ul>
      </div>
      <div className={styles.applyRow}>
        <button
          type="button"
          className={styles.primary}
          disabled={disabled || fillEmptyCount === 0}
          onClick={() => onApply("fill-empty")}
          title="只填入目前空的欄位，不覆蓋你已經填好的內容"
        >
          只補空欄位（{fillEmptyCount} 項）
        </button>
        <button
          type="button"
          className={styles.secondary}
          disabled={disabled || overwriteCount === 0}
          onClick={() => onApply("overwrite")}
          title="OCR 有值的全部覆蓋（目前有值的欄位也會被蓋過）"
        >
          全部覆蓋（{overwriteCount} 項）
        </button>
      </div>
    </div>
  );
}

function fieldPreviewRow(label: string, value: string | undefined) {
  if (!value) return null;
  return (
    <li>
      <span className={styles.fieldLabel}>{label}</span>
      <span>{value}</span>
    </li>
  );
}

function phaseWithPreview(phase: Extract<Phase, { kind: "review" }>): string {
  return phase.previewUrl;
}

async function blobToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
