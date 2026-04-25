"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { getActionItemsAction, setFollowUpAction } from "@/app/(app)/cards/actions";
import type { ActionItem } from "@/lib/coach/action-items";

import styles from "./ActionItemsSection.module.css";

type State =
  | { kind: "loading" }
  | { kind: "ready"; items: ActionItem[]; cached: boolean }
  | { kind: "hidden" };

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

/**
 * Surfaces AI-extracted promises ("I said I'd send the deck", "I owe him
 * an intro") at the top of /followups. Hides on any failure (LLM not
 * configured, no events, parser dropped everything) — no scary banner
 * when the inferred list is empty.
 *
 * Per-item: ✓ button calls setFollowUpAction(cardId, tomorrow). The card
 * is the source of truth for the reminder; we don't persist the action
 * text itself (intentional simplicity — user can rewrite during set).
 */
export function ActionItemsSection() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void getActionItemsAction({ sinceDays: 14 }).then((res) => {
      if (cancelled) return;
      if (!res?.data || !res.data.ok || res.data.items.length === 0) {
        setState({ kind: "hidden" });
        return;
      }
      setState({ kind: "ready", items: res.data.items, cached: res.data.cached });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSetFollowup = (cardId: string) => {
    startTransition(async () => {
      const res = await setFollowUpAction({ id: cardId, followUpAt: tomorrowIso() });
      if (res?.data?.ok) {
        setDone((prev) => new Set(prev).add(cardId));
      }
    });
  };

  const handleDismiss = (key: string) => {
    setDismissed((prev) => new Set(prev).add(key));
  };

  if (state.kind === "hidden") return null;

  if (state.kind === "loading") {
    return (
      <section className={styles.section} aria-label="AI 觀察到的 action items">
        <p className={styles.label}>✨ AI 觀察到的 action items</p>
        <p className={styles.placeholder}>掃描中…</p>
      </section>
    );
  }

  const visible = state.items.filter((it) => !dismissed.has(`${it.cardId}::${it.action}`));
  if (visible.length === 0) return null;

  return (
    <section className={styles.section} aria-label="AI 觀察到的 action items">
      <p className={styles.label}>✨ AI 觀察到的 action items</p>
      <ul className={styles.list}>
        {visible.map((item) => {
          const key = `${item.cardId}::${item.action}`;
          const isDone = done.has(item.cardId);
          return (
            <li key={key} className={styles.item}>
              <div className={styles.body}>
                <p className={styles.action}>
                  {item.action}
                  {item.dueHint && <span className={styles.dueHint}>（{item.dueHint}）</span>}
                </p>
                <Link href={`/cards/${item.cardId}`} className={styles.cardLink}>
                  → 看卡片
                </Link>
              </div>
              <div className={styles.actions}>
                {isDone ? (
                  <span className={styles.done}>✓ 已排提醒</span>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.setBtn}
                      onClick={() => handleSetFollowup(item.cardId)}
                      disabled={pending}
                      title="把這個 action item 排到明天提醒"
                    >
                      ✓ 排提醒
                    </button>
                    <button
                      type="button"
                      className={styles.dismissBtn}
                      onClick={() => handleDismiss(key)}
                    >
                      略過
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
