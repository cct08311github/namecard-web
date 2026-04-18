"use client";

import { useTransition, useState } from "react";

import { exportCardsAction } from "@/app/(app)/export/actions";

import styles from "./ExportButton.module.css";

interface ExportButtonProps {
  /** When provided, export only these card ids (e.g. current tag filter). */
  cardIds?: string[];
  /** Button label override. */
  label?: string;
}

export function ExportButton({ cardIds, label = "匯出" }: ExportButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function triggerDownload(zipBase64: string, filename: string) {
    const bytes = Uint8Array.from(atob(zipBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    // Revoke on next tick to let the browser initiate the download.
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function handleClick() {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await exportCardsAction(
        cardIds ? { scope: "ids", cardIds } : { scope: "all" },
      );

      if (result?.serverError) {
        setErrorMsg(result.serverError);
        return;
      }

      if (result?.data) {
        triggerDownload(result.data.zipBase64, result.data.filename);
      }
    });
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? "匯出中…" : label}
      </button>
      {errorMsg && (
        <p role="alert" className={styles.error}>
          {errorMsg}
        </p>
      )}
    </div>
  );
}
