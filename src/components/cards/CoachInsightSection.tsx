"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  getCoachInsightsAction,
  setFollowUpAction,
  toggleCardPinAction,
} from "@/app/(app)/cards/actions";
import type { CoachInsight } from "@/lib/coach/insights";

import styles from "./CoachInsightSection.module.css";

interface CoachInsightSectionProps {
  cardId: string;
  isPinned?: boolean;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; insight: CoachInsight; cached: boolean }
  | { kind: "error"; message: string };

function offsetIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * "✨ AI 人脈教練" disclosure on /cards/[id]. Wraps the
 * `getCoachInsightsAction` Server Action and renders three buckets of
 * actionable insight (conversation starters, inferred needs, suggested
 * actions) with inline buttons for the most common follow-up moves
 * (set reminder, pin).
 *
 * The whole section opts in — no LLM call until the user explicitly
 * requests it. That keeps page-load fast and avoids burning tokens on
 * cards the user is just glancing at.
 */
export function CoachInsightSection({ cardId, isPinned = false }: CoachInsightSectionProps) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [actionToast, setActionToast] = useState<string | null>(null);

  const fetchInsights = (force: boolean) => {
    setState({ kind: "loading" });
    startTransition(async () => {
      const result = await getCoachInsightsAction({ cardId, force });
      if (result?.serverError) {
        setState({ kind: "error", message: result.serverError });
        return;
      }
      const data = result?.data;
      if (!data) {
        setState({ kind: "error", message: "教練回應失敗，請稍後再試" });
        return;
      }
      if (!data.ok) {
        const messages: Record<string, string> = {
          "no-llm": "AI 教練未啟用（管理員未設定 LLM 金鑰）",
          "card-not-found": "找不到這張名片",
          "llm-failed": "AI 教練暫時無法回應，請稍後再試",
        };
        setState({ kind: "error", message: messages[data.reason] ?? "未知錯誤" });
        return;
      }
      setState({ kind: "ready", insight: data.insight, cached: data.cached });
    });
  };

  const flashAction = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 2500);
  };

  const setReminder = (days: number) => {
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

  const togglePin = () => {
    startTransition(async () => {
      const result = await toggleCardPinAction({ id: cardId, pinned: !isPinned });
      if (result?.data?.ok) {
        flashAction(isPinned ? "已取消重要" : "已加入重要聯絡人");
        router.refresh();
      } else {
        flashAction("操作失敗");
      }
    });
  };

  return (
    <section className={styles.section} aria-label="AI 人脈教練">
      <header className={styles.header}>
        <h2 className={styles.title}>
          <span className={styles.sparkle} aria-hidden="true">
            ✨
          </span>
          AI 人脈教練
        </h2>
        {state.kind === "ready" && (
          <button
            type="button"
            className={styles.regenerate}
            onClick={() => fetchInsights(true)}
            disabled={pending}
          >
            {state.cached ? "重新生成" : "再來一輪"}
          </button>
        )}
      </header>

      {state.kind === "idle" && (
        <div className={styles.emptyState}>
          <p className={styles.lead}>
            問問 AI：下次聯絡這個人可以聊什麼？他現在可能在意什麼？這週可以做哪些動作？
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => fetchInsights(false)}
            disabled={pending}
          >
            {pending ? "教練思考中…" : "✨ 請 AI 教練給我建議"}
          </button>
        </div>
      )}

      {state.kind === "loading" && (
        <div className={styles.loading} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>教練正在閱讀這張名片的脈絡…</span>
        </div>
      )}

      {state.kind === "error" && (
        <div className={styles.errorBox} role="alert">
          <p>{state.message}</p>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => fetchInsights(false)}
            disabled={pending}
          >
            重試
          </button>
        </div>
      )}

      {state.kind === "ready" && (
        <div className={styles.results}>
          {state.insight.conversationStarters.length > 0 && (
            <Bucket icon="🗣️" title="下次聯絡可以聊" items={state.insight.conversationStarters} />
          )}
          {state.insight.inferredNeeds.length > 0 && (
            <Bucket icon="💼" title="他現在可能在意" items={state.insight.inferredNeeds} />
          )}
          {state.insight.suggestedActions.length > 0 && (
            <Bucket icon="🎯" title="建議本週的行動" items={state.insight.suggestedActions} />
          )}

          <div className={styles.quickActions}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => setReminder(3)}
              disabled={pending}
            >
              📅 設 +3 天提醒
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => setReminder(7)}
              disabled={pending}
            >
              📅 設 +7 天提醒
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => setReminder(14)}
              disabled={pending}
            >
              📅 設 +14 天提醒
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={togglePin}
              disabled={pending}
            >
              {isPinned ? "📍 取消重要" : "📌 加入重要聯絡人"}
            </button>
          </div>

          {state.cached && (
            <p className={styles.cachedNote}>
              這份建議來自 24 小時內的快取，點「重新生成」可重算。
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

function Bucket({ icon, title, items }: { icon: string; title: string; items: string[] }) {
  return (
    <div className={styles.bucket}>
      <h3 className={styles.bucketTitle}>
        <span className={styles.bucketIcon} aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      <ul className={styles.bucketList}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
