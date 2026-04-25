"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setPublicSlugAction } from "@/app/(app)/cards/actions";

import styles from "./PublicProfileToggle.module.css";

interface PublicProfileToggleProps {
  cardId: string;
  /** Current slug if the card is already public; null/undefined when not. */
  currentSlug?: string | null;
  /** Suggested default slug derived from name (lowercased, normalized). */
  defaultSlugSuggestion?: string;
}

function publicUrlFor(slug: string): string {
  if (typeof window === "undefined") return `/u/${slug}`;
  return `${window.location.origin}/u/${slug}`;
}

/**
 * "🪪 數位名片" disclosure on /cards/[id] sidebar. User picks a slug,
 * we POST → setPublicSlugAction; on success the card is reachable at
 * `/u/{slug}` (no auth needed). Provides copy-URL + open-in-new-tab
 * + clear toggle. Errors (clash, reserved word, format) surface inline.
 */
export function PublicProfileToggle({
  cardId,
  currentSlug = null,
  defaultSlugSuggestion = "",
}: PublicProfileToggleProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(currentSlug ?? defaultSlugSuggestion);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const submit = (slug: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await setPublicSlugAction({ cardId, slug: slug ?? "" });
      const data = result?.data;
      if (result?.serverError) {
        setError(result.serverError);
        return;
      }
      if (!data) {
        setError("操作失敗，請重試");
        return;
      }
      if (!data.ok) {
        setError(data.reason);
        return;
      }
      flash(slug ? `已設為公開於 /u/${data.slug ?? slug}` : "已停用公開頁");
      router.refresh();
    });
  };

  const copyUrl = async () => {
    if (!currentSlug) return;
    const url = publicUrlFor(currentSlug);
    try {
      await navigator.clipboard.writeText(url);
      flash("已複製公開網址");
    } catch {
      flash("複製失敗");
    }
  };

  return (
    <section className={styles.section} aria-label="公開數位名片">
      <header className={styles.header}>
        <h3 className={styles.title}>🪪 數位名片</h3>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "收起" : currentSlug ? "管理" : "設定"}
        </button>
      </header>

      {currentSlug && !open && (
        <div className={styles.activeSummary}>
          <a
            href={publicUrlFor(currentSlug)}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.activeLink}
          >
            /u/{currentSlug} ↗
          </a>
          <button type="button" onClick={copyUrl} className={styles.smallBtn}>
            複製網址
          </button>
        </div>
      )}

      {!currentSlug && !open && (
        <p className={styles.hint}>
          把這張卡變可分享的數位名片 — 對方掃 QR / 點連結即看，不需要帳號。
        </p>
      )}

      {open && (
        <div className={styles.editor}>
          <label htmlFor={`slug-${cardId}`} className={styles.label}>
            自訂網址 ({typeof window !== "undefined" ? `${window.location.origin}/u/` : "/u/"}…)
          </label>
          <input
            id={`slug-${cardId}`}
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
            maxLength={30}
            placeholder="例如 yu-han 或 chen-yh"
            aria-describedby={error ? `slug-err-${cardId}` : undefined}
          />
          <p className={styles.helper}>3-30 字，小寫英數、底線、減號；不得以符號開頭/結尾。</p>
          {error && (
            <p id={`slug-err-${cardId}`} role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => submit(draft.trim() || null)}
              disabled={pending}
            >
              {pending ? "套用中…" : currentSlug === draft.trim() ? "未變更" : "套用"}
            </button>
            {currentSlug && (
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={() => submit(null)}
                disabled={pending}
              >
                停用公開頁
              </button>
            )}
            <button type="button" className={styles.smallBtn} onClick={() => setOpen(false)}>
              關閉
            </button>
          </div>
        </div>
      )}

      {toast && (
        <p role="status" aria-live="polite" className={styles.toast}>
          {toast}
        </p>
      )}
    </section>
  );
}
