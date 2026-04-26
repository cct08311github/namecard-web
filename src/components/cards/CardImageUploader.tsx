"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { attachCardImageAction } from "@/app/(app)/cards/actions";

import styles from "./CardImageUploader.module.css";

interface CardImageUploaderProps {
  cardId: string;
  /** True when the card already has frontImagePath — the button label changes from "上傳" to "換一張". */
  hasFrontImage: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  // Process in chunks to avoid call-stack overflow on large files.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Tiny client component that lets a user attach (or replace) the
 * front photo of an existing card. Hides the native file picker
 * behind a styled button. After upload, calls router.refresh() so
 * the sibling <CardImagePreview> server component re-fetches a
 * fresh signed URL and renders the new image.
 */
export function CardImageUploader({ cardId, hasFrontImage }: CardImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onFile = (file: File) => {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("檔案超過 10MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("請選圖片檔");
      return;
    }
    startTransition(async () => {
      try {
        const fileBase64 = await fileToBase64(file);
        const res = await attachCardImageAction({
          cardId,
          fileBase64,
          mimeType: file.type || "image/jpeg",
          side: "front",
          originalName: file.name,
        });
        if (!res?.data) {
          setError("送出失敗（網路）");
          return;
        }
        if (!res.data.ok) {
          setError(res.data.reason);
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "上傳失敗");
      }
    });
  };

  return (
    <div className={styles.row}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.input}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          // Reset so picking the same file twice still triggers onChange.
          e.target.value = "";
        }}
        disabled={pending}
      />
      <button
        type="button"
        className={styles.button}
        onClick={() => inputRef.current?.click()}
        disabled={pending}
      >
        {pending ? "上傳中…" : hasFrontImage ? "📷 換一張照片" : "📷 上傳名片照片"}
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
