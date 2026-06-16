"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { createCardAction } from "@/app/(app)/cards/actions";
import { scanCardAction } from "@/app/(app)/cards/scan/actions";
import type { CardCreateInput } from "@/db/schema";
import { compressImage } from "@/lib/image/compress";
import type { OcrFields } from "@/lib/ocr/types";

import { CardFormPrefilled } from "./CardFormPrefilled";
import styles from "./ScanFlow.module.css";

type Phase =
  | { kind: "idle" }
  | { kind: "compressing"; previewUrl: string }
  | { kind: "uploading"; previewUrl: string }
  | {
      kind: "review";
      previewUrl: string;
      fields: OcrFields;
      imagePath: string;
      provider: string;
      durationMs: number;
    }
  | { kind: "ocr-failed"; previewUrl: string; message: string; imagePath?: string };

/**
 * Orchestrates: file select → base64 → scan server action → review form.
 *
 * Stays within this component so the flow is readable top-to-bottom; the
 * CardForm pre-fill bits are in CardFormPrefilled.
 */
export function ScanFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setSubmitError(null);
    const previewUrl = URL.createObjectURL(file);

    // Step 1: Client-side compression to avoid 413 on large iPhone photos.
    setPhase({ kind: "compressing", previewUrl });
    let uploadBlob: Blob;
    try {
      uploadBlob = await compressImage(file, {
        maxLongestSide: 2048,
        quality: 0.85,
        skipIfBelowBytes: 2 * 1024 * 1024, // skip if already < 2 MB
      });
    } catch {
      // Compression failed (e.g. corrupt image); fall back to original.
      uploadBlob = file;
    }

    // Step 2: Encode and send to server action.
    setPhase({ kind: "uploading", previewUrl });

    const fileBase64 = await blobToBase64(uploadBlob);
    let result: Awaited<ReturnType<typeof scanCardAction>>;
    try {
      result = await scanCardAction({
        fileBase64,
        mimeType: file.type || "image/jpeg",
        originalName: file.name,
      });
    } catch (err) {
      // Next.js throws before reaching the action when the body is too large.
      // Detect by inspecting the error message for status 413.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("413") || msg.toLowerCase().includes("body exceeded")) {
        setPhase({
          kind: "ocr-failed",
          previewUrl,
          message: formatOcrError({ kind: "payload-too-large", message: msg }),
        });
      } else {
        setPhase({ kind: "ocr-failed", previewUrl, message: `上傳失敗：${msg}` });
      }
      return;
    }

    if (result?.serverError) {
      // Check if the server surfaced a payload-too-large message.
      const isPayloadTooLarge =
        result.serverError.includes("413") ||
        result.serverError.toLowerCase().includes("body exceeded");
      setPhase({
        kind: "ocr-failed",
        previewUrl,
        message: isPayloadTooLarge
          ? formatOcrError({ kind: "payload-too-large", message: result.serverError })
          : result.serverError,
      });
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
    if (!data) {
      setPhase({
        kind: "ocr-failed",
        previewUrl,
        message: "未收到伺服器回應",
      });
      return;
    }

    if (!data.ok) {
      const err = data.error;
      setPhase({
        kind: "ocr-failed",
        previewUrl,
        imagePath: data.imagePath,
        message: formatOcrError(err),
      });
      return;
    }

    setPhase({
      kind: "review",
      previewUrl,
      fields: data.fields,
      imagePath: data.imagePath,
      provider: data.meta.provider,
      durationMs: data.meta.durationMs,
    });
  }

  function reset() {
    if (phase.kind !== "idle" && "previewUrl" in phase) {
      URL.revokeObjectURL(phase.previewUrl);
    }
    setPhase({ kind: "idle" });
    setSubmitError(null);
  }

  function handleSubmit(payload: CardCreateInput) {
    setSubmitError(null);
    startSubmit(async () => {
      const result = await createCardAction(payload);
      if (result?.serverError) {
        setSubmitError(result.serverError);
        return;
      }
      const id = result?.data?.id;
      if (!id) {
        setSubmitError("儲存失敗，請再試一次");
        return;
      }
      router.push(`/cards/${id}`);
      router.refresh();
    });
  }

  if (phase.kind === "idle") {
    return <UploadPicker onFile={handleFile} />;
  }

  if (phase.kind === "compressing") {
    return (
      <div className={styles.layout}>
        <ImagePane url={phase.previewUrl} />
        <div className={styles.pane}>
          <div className={styles.statusPill}>縮圖中…</div>
          <p className={styles.statusHint}>正在壓縮圖片以加快上傳速度。</p>
        </div>
      </div>
    );
  }

  if (phase.kind === "uploading") {
    return (
      <div className={styles.layout}>
        <ImagePane url={phase.previewUrl} />
        <div className={styles.pane}>
          <div className={styles.statusPill}>辨識中…</div>
          <OcrProgressHint />
        </div>
      </div>
    );
  }

  if (phase.kind === "ocr-failed") {
    return (
      <div className={styles.layout}>
        <ImagePane url={phase.previewUrl} />
        <div className={styles.pane}>
          <div className={`${styles.statusPill} ${styles.statusError}`}>辨識失敗</div>
          <p className={styles.statusHint}>{phase.message}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={reset}>
              重新選圖
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => router.push("/cards/new")}
            >
              改手動輸入
            </button>
          </div>
        </div>
      </div>
    );
  }

  // review
  return (
    <div className={styles.layout}>
      <ImagePane url={phase.previewUrl} />
      <div className={styles.pane}>
        <div className={styles.statusPill}>
          辨識完成 · {phase.provider} · {(phase.durationMs / 1000).toFixed(1)}s
        </div>
        <CardFormPrefilled
          ocrFields={phase.fields}
          imagePath={phase.imagePath}
          onSubmit={handleSubmit}
          submitting={submitting}
          serverError={submitError}
        />
      </div>
    </div>
  );
}

function UploadPicker({ onFile }: { onFile: (file: File) => void }) {
  return (
    <div className={styles.picker}>
      <label className={styles.pickerLabel}>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className={styles.pickerInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <span className={styles.pickerCta}>拍照或選擇名片圖片</span>
        <span className={styles.pickerHint}>手機：相機直接拍照 / 桌機：選擇檔案。最大 10MB。</span>
      </label>
    </div>
  );
}

function ImagePane({ url }: { url: string }) {
  // Scheme allowlist — url is always a same-origin blob: from
  // URL.createObjectURL, but a scheme check keeps XSS analyzers happy and
  // defends against future refactors that might route signed URLs here.
  const isSafe = url.startsWith("blob:") || url.startsWith("https://");
  if (!isSafe) return null;
  return (
    <figure className={styles.imagePane}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Card preview" />
    </figure>
  );
}

/**
 * Shows an escalating hint while MiniMax OCR is running.
 *
 * Phases: initial (0-8s) → slow (8-18s) → very slow (18s+).
 * All thresholds are comfortably under the 30s server-side AbortController
 * timeout, so the user always sees a final message before the error appears.
 */
function OcrProgressHint() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  if (elapsed < 8) {
    return <p className={styles.statusHint}>MiniMax 正在讀這張卡。通常 3-6 秒。</p>;
  }
  if (elapsed < 18) {
    return <p className={styles.statusHint}>還在辨識中，MiniMax 有時比較慢，請稍候…</p>;
  }
  return <p className={styles.statusHint}>快好了，最長等到 30 秒後會告知結果。</p>;
}

function formatOcrError(err: {
  kind: string;
  message: string;
  retryAfterMs?: number;
  timeoutMs?: number;
  limit?: number;
}): string {
  switch (err.kind) {
    case "rate-limit":
      return `API 流量限制，請 ${Math.ceil((err.retryAfterMs ?? 5000) / 1000)} 秒後再試`;
    case "rate-limit-exceeded":
      return `今日掃描次數已達上限（${err.limit ?? 50} 張/天），請明日再試。`;
    case "timeout":
      return `辨識逾時（${Math.round((err.timeoutMs ?? 30000) / 1000)} 秒）。MiniMax 目前較慢，請稍後再試，或改手動輸入。`;
    case "network":
      return `網路錯誤：${err.message}`;
    case "invalid-response":
      return "OCR 回傳格式異常，改手動輸入較快";
    case "unsupported":
      return "OCR 服務未配置";
    case "invalid-image":
      return "檔案格式不符，僅接受 JPEG/PNG/WebP/HEIC 圖片。";
    case "payload-too-large":
      return "照片太大（已嘗試壓縮但仍超過 20MB）。請改用較小解析度。";
    default:
      return err.message;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuf = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  // btoa only works on latin1; chunk-convert for large payloads safely.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}
