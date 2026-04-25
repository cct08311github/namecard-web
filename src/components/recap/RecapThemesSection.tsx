"use client";

import { useEffect, useState } from "react";

import { getRecapThemesAction } from "@/app/(app)/recap/actions";

import styles from "./RecapThemesSection.module.css";

type State =
  | { kind: "loading" }
  | { kind: "ready"; themes: string[]; cached: boolean }
  | { kind: "hidden" };

/**
 * Shows AI-extracted themes from the user's recent /log entries. Calls
 * `getRecapThemesAction` on mount; degrades silently to a hidden render
 * on any failure (no LLM key, zero items, parser failure). The point is
 * to surface insight when available — not to clutter the page when not.
 */
export function RecapThemesSection() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getRecapThemesAction({ sinceDays: 14 }).then((res) => {
      if (cancelled) return;
      if (!res?.data || !res.data.ok) {
        setState({ kind: "hidden" });
        return;
      }
      setState({ kind: "ready", themes: res.data.themes, cached: res.data.cached });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "hidden") return null;

  if (state.kind === "loading") {
    return (
      <section className={styles.section} aria-label="本週主題">
        <p className={styles.label}>✨ 本週主題</p>
        <p className={styles.placeholder}>AI 整理中…</p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="本週主題">
      <p className={styles.label}>✨ 本週主題</p>
      <ul className={styles.themeList}>
        {state.themes.map((theme) => (
          <li key={theme} className={styles.themeChip}>
            {theme}
          </li>
        ))}
      </ul>
    </section>
  );
}
