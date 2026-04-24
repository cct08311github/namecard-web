"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { deleteCardAction, logContactAction, toggleCardPinAction } from "@/app/(app)/cards/actions";
import { shareCardVcard } from "@/lib/share/card-share";

import styles from "./CardActions.module.css";

interface CardActionsProps {
  cardId: string;
  displayName?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  lineId?: string;
  linkedinUrl?: string;
  isPinned?: boolean;
}

export function CardActions({
  cardId,
  displayName,
  primaryPhone,
  primaryEmail,
  lineId,
  linkedinUrl,
  isPinned = false,
}: CardActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [logNoteOpen, setLogNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleTouch = () => {
    // First click: reveal the note input. User can type a note and submit,
    // or click 「跳過備註」 to log an empty event. This keeps 1-click
    // behavior cheap while making the log meaningful when content matters.
    if (!logNoteOpen) {
      setLogNoteOpen(true);
      return;
    }
    submitLog(noteDraft);
  };

  const submitLog = (note: string) => {
    setError(null);
    startTransition(async () => {
      const result = await logContactAction({ id: cardId, note });
      if (result?.serverError) setError(result.serverError);
      else {
        setToast(note.trim() ? "已記錄互動" : "已標記聯絡");
        setLogNoteOpen(false);
        setNoteDraft("");
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

  const handleTogglePin = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleCardPinAction({ id: cardId, pinned: !isPinned });
      if (result?.serverError) setError(result.serverError);
      else {
        setToast(isPinned ? "已取消置頂" : "已加入重要聯絡人");
        router.refresh();
      }
    });
  };

  const handleShare = async () => {
    setError(null);
    try {
      const outcome = await shareCardVcard(cardId, displayName ?? "名片");
      if (outcome === "shared") setToast("已分享");
      else if (outcome === "downloaded") setToast("已下載 vCard");
      // "cancelled" → user dismissed the share sheet; no toast.
    } catch {
      setToast("分享失敗，已改為下載");
    }
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
          aria-expanded={logNoteOpen}
        >
          <span className={styles.quickIcon} aria-hidden="true">
            ✅
          </span>
          <span className={styles.quickLabel}>
            {pending ? "記錄中…" : logNoteOpen ? "記錄" : "已聯絡"}
          </span>
        </button>
      </div>

      {logNoteOpen && (
        <div className={styles.noteBox}>
          <textarea
            className={styles.noteInput}
            placeholder="寫一句互動摘要（可留空）"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={2}
            autoFocus
            aria-label="互動備註（500 字以內）"
          />
          <div className={styles.noteActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => submitLog("")}
              disabled={pending}
            >
              跳過備註
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setLogNoteOpen(false);
                setNoteDraft("");
              }}
              disabled={pending}
            >
              取消
            </button>
          </div>
        </div>
      )}

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
        <button
          type="button"
          className={styles.secondary}
          onClick={handleTogglePin}
          disabled={pending}
          aria-pressed={isPinned}
        >
          {isPinned ? "📍 已置頂（取消）" : "📌 設為重要聯絡人"}
        </button>
        <button type="button" className={styles.secondary} onClick={handleShare}>
          📤 分享名片
        </button>
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
