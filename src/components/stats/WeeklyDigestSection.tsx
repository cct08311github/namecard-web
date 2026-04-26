"use client";

import { useEffect, useState } from "react";

import { getWeeklyDigestAction } from "@/app/(app)/stats/actions";

import styles from "./WeeklyDigestSection.module.css";

type State =
  | { kind: "loading" }
  | { kind: "ready"; digest: string; cached: boolean }
  | { kind: "hidden" };

/**
 * Fetches the AI-generated weekly digest paragraph on mount and renders
 * it at the top of /stats. Hides silently on any failure (no LLM key,
 * no data, parser empty) so the page never shows a half-broken section.
 */
export function WeeklyDigestSection() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getWeeklyDigestAction({}).then((res) => {
      if (cancelled) return;
      if (!res?.data || !res.data.ok) {
        setState({ kind: "hidden" });
        return;
      }
      setState({ kind: "ready", digest: res.data.digest, cached: res.data.cached });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "hidden") return null;

  if (state.kind === "loading") {
    return (
      <section className={styles.section} aria-label="本週摘要">
        <p className={styles.label}>✨ 本週摘要</p>
        <p className={styles.placeholder}>AI 整理中…</p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="本週摘要">
      <p className={styles.label}>✨ 本週摘要</p>
      <p className={styles.body}>{state.digest}</p>
    </section>
  );
}
