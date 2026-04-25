"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { getIntroSuggestionsAction } from "@/app/(app)/cards/actions";
import type { CardSummary } from "@/db/cards";
import type { IntroSuggestion } from "@/lib/coach/intros";

import styles from "./IntroSuggestionsList.module.css";

interface PairedIntro {
  intro: IntroSuggestion;
  cardA: CardSummary;
  cardB: CardSummary;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; intros: PairedIntro[]; cached: boolean }
  | { kind: "error"; message: string };

function pickName(c: CardSummary): string {
  return c.nameZh || c.nameEn || "（未命名）";
}

function pickSubtitle(c: CardSummary): string {
  const role = c.jobTitleZh || c.jobTitleEn;
  const company = c.companyZh || c.companyEn;
  return [role, company].filter(Boolean).join(" · ");
}

/**
 * Opt-in disclosure on /intros that calls the LLM intro matchmaker
 * and renders 3-5 (cardA, cardB) pairs with a ready-to-send intro
 * email body. Each pair has copy-email + open-mailto deep links to
 * either party's primary email.
 */
export function IntroSuggestionsList() {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const fetchIntros = (force: boolean) => {
    setState({ kind: "loading" });
    startTransition(async () => {
      const result = await getIntroSuggestionsAction({ force });
      const data = result?.data;
      if (result?.serverError) {
        setState({ kind: "error", message: result.serverError });
        return;
      }
      if (!data) {
        setState({ kind: "error", message: "建議官沒回應，請稍後再試" });
        return;
      }
      if (!data.ok) {
        const messages: Record<string, string> = {
          "no-llm": "AI 未啟用",
          "too-few-cards": "名片冊還不夠 — 至少需要 4 張包含公司資訊的名片",
          "llm-failed": "AI 暫時無法回應，請稍後再試",
        };
        setState({ kind: "error", message: messages[data.reason] ?? "未知錯誤" });
        return;
      }
      setState({ kind: "ready", intros: data.intros, cached: data.cached });
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

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.title}>每週推薦的 intro 對</h2>
        {state.kind === "ready" && (
          <button
            type="button"
            className={styles.regenerate}
            onClick={() => fetchIntros(true)}
            disabled={pending}
          >
            {state.cached ? "重新產生" : "再來一輪"}
          </button>
        )}
      </header>

      {state.kind === "idle" && (
        <div className={styles.emptyState}>
          <p className={styles.lead}>
            按下按鈕，AI 會掃過你的名片冊（會優先看 pinned + 最近聯絡的人），找出 3-5 對應該認識的人
            + 為什麼 + 寫好的 intro email。
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => fetchIntros(false)}
            disabled={pending}
          >
            {pending ? "AI 配對中…" : "🤝 找出本週的 intro 對"}
          </button>
        </div>
      )}

      {state.kind === "loading" && (
        <div className={styles.loading} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>AI 正在掃描你的名片冊找出最有 fit 的 pair…</span>
        </div>
      )}

      {state.kind === "error" && (
        <div className={styles.errorBox} role="alert">
          <p>{state.message}</p>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => fetchIntros(false)}
            disabled={pending}
          >
            重試
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <div className={styles.results}>
          {state.intros.length === 0 ? (
            <p className={styles.empty}>AI 這週沒找到明顯的 intro 對。下週再試試。</p>
          ) : (
            <ol className={styles.pairList}>
              {state.intros.map((entry, i) => {
                const emailA = entry.cardA.emails?.[0]?.value;
                const emailB = entry.cardB.emails?.[0]?.value;
                const recipientList = [emailA, emailB].filter(Boolean).join(",");
                const subjectIntro = `Intro: ${pickName(entry.cardA)} ↔ ${pickName(entry.cardB)}`;
                return (
                  <li key={i} className={styles.pair}>
                    <div className={styles.rank} aria-hidden="true">
                      {i + 1}
                    </div>
                    <div className={styles.pairBody}>
                      <div className={styles.cards}>
                        <PairCardChip card={entry.cardA} />
                        <span className={styles.connector} aria-hidden="true">
                          ↔
                        </span>
                        <PairCardChip card={entry.cardB} />
                      </div>
                      <p className={styles.reason}>{entry.intro.reason}</p>
                      <details className={styles.draftWrap}>
                        <summary className={styles.draftSummary}>📧 看 intro email 草稿</summary>
                        <pre className={styles.draft}>{entry.intro.draftEmail}</pre>
                        <div className={styles.draftActions}>
                          <button
                            type="button"
                            className={styles.smallBtn}
                            onClick={() => copy(entry.intro.draftEmail, "草稿")}
                          >
                            複製草稿
                          </button>
                          {recipientList && (
                            <a
                              href={`mailto:${recipientList}?subject=${encodeURIComponent(subjectIntro)}&body=${encodeURIComponent(entry.intro.draftEmail)}`}
                              className={styles.smallLink}
                            >
                              開信件 (寄給雙方) →
                            </a>
                          )}
                        </div>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {state.cached && (
            <p className={styles.cachedNote}>
              這份建議來自本週的快取。新增名片或下週會自動重算；想立刻換組可點「重新產生」。
            </p>
          )}
        </div>
      )}

      {copyToast && (
        <p role="status" aria-live="polite" className={styles.toast}>
          {copyToast}
        </p>
      )}
    </section>
  );
}

function PairCardChip({ card }: { card: CardSummary }) {
  return (
    <Link href={`/cards/${card.id}`} className={styles.chip}>
      <span className={styles.chipName}>{pickName(card)}</span>
      <span className={styles.chipSub}>{pickSubtitle(card)}</span>
    </Link>
  );
}
