"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { deleteCardAction, touchCardAction } from "@/app/(app)/cards/actions";

import styles from "./CardActions.module.css";

interface CardActionsProps {
  cardId: string;
  primaryPhone?: string;
  primaryEmail?: string;
  lineId?: string;
  linkedinUrl?: string;
}

export function CardActions({
  cardId,
  primaryPhone,
  primaryEmail,
  lineId,
  linkedinUrl,
}: CardActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleTouch = () => {
    setError(null);
    startTransition(async () => {
      const result = await touchCardAction({ id: cardId });
      if (result?.serverError) setError(result.serverError);
      else {
        setToast("已記錄聯絡");
        router.refresh();
      }
    });
  };

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteCardAction({ id: cardId });
      if (result?.serverError) setError(result.serverError);
      else router.push("/cards");
    });
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast(`已複製${label}`);
    } catch {
      setToast("複製失敗");
    }
  };

  // LINE deep-link: older LINE IDs (@foo) use line://ti/p/@foo, user IDs
  // without @ use ~{id}. Both open the LINE app when present.
  const lineHref = lineId
    ? `https://line.me/ti/p/${lineId.startsWith("@") ? encodeURIComponent(lineId) : `~${encodeURIComponent(lineId)}`}`
    : null;

  return (
    <section className={styles.actions} aria-label="Actions">
      <p className={styles.title}>快速動作</p>

      {/* Primary CTAs — 商務人士最常觸發的四個動作 */}
      <div className={styles.quick}>
        {primaryPhone ? (
          <a
            href={`tel:${primaryPhone}`}
            className={styles.quickButton}
            aria-label={`撥打 ${primaryPhone}`}
          >
            <span className={styles.quickIcon} aria-hidden="true">
              📞
            </span>
            <span className={styles.quickLabel}>電話</span>
          </a>
        ) : (
          <span className={`${styles.quickButton} ${styles.quickDisabled}`} aria-disabled="true">
            <span className={styles.quickIcon} aria-hidden="true">
              📞
            </span>
            <span className={styles.quickLabel}>電話</span>
          </span>
        )}
        {primaryEmail ? (
          <a
            href={`mailto:${primaryEmail}`}
            className={styles.quickButton}
            aria-label={`寄信到 ${primaryEmail}`}
          >
            <span className={styles.quickIcon} aria-hidden="true">
              📧
            </span>
            <span className={styles.quickLabel}>Email</span>
          </a>
        ) : (
          <span className={`${styles.quickButton} ${styles.quickDisabled}`} aria-disabled="true">
            <span className={styles.quickIcon} aria-hidden="true">
              📧
            </span>
            <span className={styles.quickLabel}>Email</span>
          </span>
        )}
        {lineHref ? (
          <a
            href={lineHref}
            className={styles.quickButton}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="開啟 LINE"
          >
            <span className={styles.quickIcon} aria-hidden="true">
              💬
            </span>
            <span className={styles.quickLabel}>LINE</span>
          </a>
        ) : (
          <span className={`${styles.quickButton} ${styles.quickDisabled}`} aria-disabled="true">
            <span className={styles.quickIcon} aria-hidden="true">
              💬
            </span>
            <span className={styles.quickLabel}>LINE</span>
          </span>
        )}
        <button
          type="button"
          className={`${styles.quickButton} ${styles.quickPrimary}`}
          onClick={handleTouch}
          disabled={pending}
          aria-label="記錄為已聯絡"
        >
          <span className={styles.quickIcon} aria-hidden="true">
            ✅
          </span>
          <span className={styles.quickLabel}>{pending ? "記錄中…" : "已聯絡"}</span>
        </button>
      </div>

      {/* Copy-to-clipboard row — 商務常需快速複製貼到其他 app */}
      {(primaryEmail || primaryPhone) && (
        <div className={styles.copyRow}>
          {primaryEmail && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => copyToClipboard(primaryEmail, " email")}
            >
              複製 Email
            </button>
          )}
          {primaryPhone && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => copyToClipboard(primaryPhone, "電話")}
            >
              複製電話
            </button>
          )}
        </div>
      )}

      <div className={styles.stack}>
        <a href={`/api/cards/${cardId}/vcard`} className={styles.secondary}>
          匯出 vCard
        </a>
        {linkedinUrl && (
          <a
            href={linkedinUrl}
            className={styles.secondary}
            target="_blank"
            rel="noreferrer noopener"
          >
            開啟 LinkedIn ↗
          </a>
        )}
        <Link href={`/cards/${cardId}/edit`} className={styles.secondary}>
          編輯
        </Link>
        <button
          type="button"
          className={`${styles.destructive} ${confirming ? styles.destructiveArmed : ""}`}
          onClick={handleDelete}
          disabled={pending}
        >
          {confirming ? "確定要刪除嗎？" : "刪除名片"}
        </button>
      </div>

      {toast && (
        <p role="status" aria-live="polite" className={styles.toast}>
          {toast}
        </p>
      )}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
