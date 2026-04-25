"use client";

import { useState, useTransition } from "react";

import { getReengageDraftsAction } from "@/app/(app)/cards/actions";
import type { ReengageDrafts } from "@/lib/coach/reengage";

import styles from "./ReengageDraftsButton.module.css";

interface ReengageDraftsButtonProps {
  cardId: string;
  /** Optional contact channels — when present, the UI offers "open in app" alongside copy. */
  primaryEmail?: string;
  primaryPhone?: string;
  lineId?: string;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; drafts: ReengageDrafts; cached: boolean }
  | { kind: "error"; message: string };

function lineUrl(lineId: string): string {
  return `https://line.me/ti/p/${
    lineId.startsWith("@") ? encodeURIComponent(lineId) : `~${encodeURIComponent(lineId)}`
  }`;
}

/**
 * Inline "✨ AI 草稿" disclosure on the followup row. Opt-in to avoid
 * burning tokens until the user explicitly asks for help. Renders
 * three styles (短訊 / Email / 偶遇) with copy buttons + native
 * deep-link openers when contact channels are available.
 */
export function ReengageDraftsButton({
  cardId,
  primaryEmail,
  primaryPhone,
  lineId,
}: ReengageDraftsButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const fetchDrafts = (force: boolean) => {
    setState({ kind: "loading" });
    startTransition(async () => {
      const result = await getReengageDraftsAction({ cardId, force });
      if (result?.serverError) {
        setState({ kind: "error", message: result.serverError });
        return;
      }
      const data = result?.data;
      if (!data) {
        setState({ kind: "error", message: "草稿生成失敗，請重試" });
        return;
      }
      if (!data.ok) {
        const messages: Record<string, string> = {
          "no-llm": "AI 未啟用",
          "card-not-found": "找不到名片",
          "llm-failed": "AI 暫時無法回應",
        };
        setState({ kind: "error", message: messages[data.reason] ?? "未知錯誤" });
        return;
      }
      setState({ kind: "ready", drafts: data.drafts, cached: data.cached });
    });
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(`已複製${what}`);
      setTimeout(() => setCopyToast(null), 1800);
    } catch {
      setCopyToast("複製失敗");
      setTimeout(() => setCopyToast(null), 1800);
    }
  };

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next && state.kind === "idle") fetchDrafts(false);
      return next;
    });
  };

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.trigger}
        onClick={toggle}
        aria-expanded={open}
        disabled={pending && state.kind === "loading"}
      >
        {open ? "✕ 收合" : "✨ AI 草稿"}
      </button>
      {open && (
        <div className={styles.panel} aria-live="polite">
          {state.kind === "loading" && (
            <p className={styles.loading}>
              <span className={styles.spinner} aria-hidden="true" />
              AI 寫稿中…
            </p>
          )}

          {state.kind === "error" && (
            <div className={styles.errorBox} role="alert">
              <p>{state.message}</p>
              <button type="button" className={styles.smallBtn} onClick={() => fetchDrafts(false)}>
                重試
              </button>
            </div>
          )}

          {state.kind === "ready" && (
            <div className={styles.drafts}>
              {state.drafts.shortMessage && (
                <DraftBlock title="🎯 短訊版" text={state.drafts.shortMessage}>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() => copy(state.drafts.shortMessage, "短訊")}
                  >
                    複製
                  </button>
                  {lineId && (
                    <a
                      href={lineUrl(lineId)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={styles.smallLink}
                      onClick={() => copy(state.drafts.shortMessage, "短訊")}
                    >
                      開 LINE →
                    </a>
                  )}
                  {primaryPhone && (
                    <a
                      href={`sms:${primaryPhone}?body=${encodeURIComponent(state.drafts.shortMessage)}`}
                      className={styles.smallLink}
                    >
                      開 SMS →
                    </a>
                  )}
                </DraftBlock>
              )}

              {(state.drafts.email.subject || state.drafts.email.body) && (
                <DraftBlock
                  title="📧 Email 版"
                  text={
                    state.drafts.email.subject
                      ? `Subject: ${state.drafts.email.subject}\n\n${state.drafts.email.body}`
                      : state.drafts.email.body
                  }
                >
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() =>
                      copy(
                        `Subject: ${state.drafts.email.subject}\n\n${state.drafts.email.body}`,
                        "Email",
                      )
                    }
                  >
                    複製
                  </button>
                  {primaryEmail && (
                    <a
                      href={`mailto:${primaryEmail}?subject=${encodeURIComponent(state.drafts.email.subject)}&body=${encodeURIComponent(state.drafts.email.body)}`}
                      className={styles.smallLink}
                    >
                      開信件 →
                    </a>
                  )}
                </DraftBlock>
              )}

              {state.drafts.casualPing && (
                <DraftBlock title="☕ 偶遇版" text={state.drafts.casualPing}>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() => copy(state.drafts.casualPing, "偶遇 hook")}
                  >
                    複製
                  </button>
                </DraftBlock>
              )}

              <div className={styles.footer}>
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => fetchDrafts(true)}
                  disabled={pending}
                >
                  🔄 重新生成
                </button>
                {state.cached && <span className={styles.cachedNote}>12 小時內快取</span>}
              </div>
            </div>
          )}
        </div>
      )}
      {copyToast && (
        <p className={styles.copyToast} role="status" aria-live="polite">
          {copyToast}
        </p>
      )}
    </div>
  );
}

function DraftBlock({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.draftBlock}>
      <header className={styles.draftHeader}>
        <span className={styles.draftTitle}>{title}</span>
        <div className={styles.draftActions}>{children}</div>
      </header>
      <pre className={styles.draftBody}>{text}</pre>
    </div>
  );
}
