"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  getDailyBriefingAction,
  logContactAction,
  setFollowUpAction,
} from "@/app/(app)/cards/actions";
import type { BriefingPick } from "@/lib/coach/briefing";
import type { PriorityCandidate } from "@/lib/coach/priority";

import styles from "./DailyBriefingSection.module.css";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      picks: Array<{ pick: BriefingPick; candidate: PriorityCandidate }>;
      cached: boolean;
    }
  | { kind: "error"; message: string };

function offsetIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function pickName(c: PriorityCandidate["card"]): string {
  return c.nameZh || c.nameEn || "（未命名）";
}

function pickSubtitle(c: PriorityCandidate["card"]): string {
  const role = c.jobTitleZh || c.jobTitleEn;
  const company = c.companyZh || c.companyEn;
  return [role, company].filter(Boolean).join(" · ");
}

/**
 * 「📰 今日人脈簡報」on the timeline home. Pure-fn priority scorer
 * narrows N cards → top 5; LLM picks 3 with human-voice reasons.
 * Daily-cached so opening the app multiple times today returns the
 * same picks (predictable + zero token churn).
 *
 * Opt-in: doesn't fetch until user clicks the button. Keeps page-load
 * fast and avoids tokens on cards the user is just glancing at.
 */
export function DailyBriefingSection() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [actionToast, setActionToast] = useState<string | null>(null);

  const fetchBriefing = (force: boolean) => {
    setState({ kind: "loading" });
    startTransition(async () => {
      const result = await getDailyBriefingAction({ force });
      if (result?.serverError) {
        setState({ kind: "error", message: result.serverError });
        return;
      }
      const data = result?.data;
      if (!data) {
        setState({ kind: "error", message: "簡報官沒回應，請稍後再試" });
        return;
      }
      if (!data.ok) {
        const messages: Record<string, string> = {
          "no-llm": "AI 簡報未啟用（管理員未設定 LLM 金鑰）",
          "no-candidates":
            "今天沒有需要優先聯絡的人 — 所有 followUp 都是未來日、沒有週年、Pinned 都最近聯絡過 ✨",
          "llm-failed": "簡報官暫時無法回應，請稍後再試",
        };
        setState({ kind: "error", message: messages[data.reason] ?? "未知錯誤" });
        return;
      }
      setState({ kind: "ready", picks: data.picks, cached: data.cached });
    });
  };

  const flashAction = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 2400);
  };

  const logContact = (cardId: string) => {
    startTransition(async () => {
      const result = await logContactAction({ id: cardId, note: "" });
      if (result?.data?.ok) {
        flashAction("已標記聯絡");
        router.refresh();
      } else {
        flashAction("標記失敗");
      }
    });
  };

  const setReminder = (cardId: string, days: number) => {
    startTransition(async () => {
      const result = await setFollowUpAction({ id: cardId, followUpAt: offsetIso(days) });
      if (result?.data?.ok) {
        flashAction(`已設定 +${days} 天提醒`);
        router.refresh();
      } else {
        flashAction("設定失敗");
      }
    });
  };

  return (
    <section className={styles.section} aria-label="今日人脈簡報">
      <header className={styles.header}>
        <h2 className={styles.title}>
          <span className={styles.sparkle} aria-hidden="true">
            📰
          </span>
          今日人脈簡報
        </h2>
        {state.kind === "ready" && (
          <button
            type="button"
            className={styles.regenerate}
            onClick={() => fetchBriefing(true)}
            disabled={pending}
          >
            重新生成
          </button>
        )}
      </header>

      {state.kind === "idle" && (
        <div className={styles.emptyState}>
          <p className={styles.lead}>
            問問 AI：今天最該聯絡的 3 位是誰？AI
            會看完所有提醒、週年、Pinned、久未聯絡的人，挑出最重要的 3 位 + 為什麼。
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => fetchBriefing(false)}
            disabled={pending}
          >
            {pending ? "簡報官閱讀中…" : "📰 看今天的人脈簡報"}
          </button>
        </div>
      )}

      {state.kind === "loading" && (
        <div className={styles.loading} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>簡報官正在挑出今天最重要的 3 位…</span>
        </div>
      )}

      {state.kind === "error" && (
        <div className={styles.errorBox} role="alert">
          <p>{state.message}</p>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => fetchBriefing(false)}
            disabled={pending}
          >
            重試
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <div className={styles.results}>
          <ol className={styles.pickList}>
            {state.picks.map((entry, i) => {
              const card = entry.candidate.card;
              const subtitle = pickSubtitle(card);
              return (
                <li key={card.id} className={styles.pickItem}>
                  <div className={styles.pickRank} aria-hidden="true">
                    {i + 1}
                  </div>
                  <div className={styles.pickBody}>
                    <div className={styles.pickHeader}>
                      <Link href={`/cards/${card.id}`} className={styles.pickName}>
                        {pickName(card)}
                      </Link>
                      {subtitle && <span className={styles.pickSub}>{subtitle}</span>}
                    </div>
                    <p className={styles.pickReason}>{entry.pick.reason}</p>
                    <p className={styles.pickAction}>👉 {entry.pick.suggestedAction}</p>
                    <div className={styles.pickButtons}>
                      <button
                        type="button"
                        className={styles.pickBtn}
                        onClick={() => logContact(card.id)}
                        disabled={pending}
                      >
                        ✅ 今天已聯絡
                      </button>
                      <button
                        type="button"
                        className={styles.pickBtn}
                        onClick={() => setReminder(card.id, 7)}
                        disabled={pending}
                      >
                        📅 +7 天再提醒
                      </button>
                      <Link href={`/cards/${card.id}`} className={styles.pickLink}>
                        看完整名片 →
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {state.cached && (
            <p className={styles.cachedNote}>
              這份簡報是今天上午產生的快取。明天會自動重算；想立刻換組可點「重新生成」。
            </p>
          )}
        </div>
      )}

      {actionToast && (
        <p role="status" aria-live="polite" className={styles.toast}>
          {actionToast}
        </p>
      )}
    </section>
  );
}
