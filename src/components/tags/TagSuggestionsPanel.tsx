"use client";

import { useEffect, useRef, useState } from "react";

import { suggestTagsAction } from "@/app/(app)/cards/suggest-tag-actions";
import type { CardCreateInput } from "@/db/schema";

import styles from "./TagSuggestionsPanel.module.css";

interface TagChip {
  name: string;
  source: "rules" | "llm";
  applied: boolean;
}

interface TagSuggestionsPanelProps {
  /** The card draft to analyze. Parent passes current form values. */
  cardDraft: CardCreateInput;
  /** Current tag state from the form — avoid suggesting already-selected. */
  selectedTagIds: string[];
  selectedTagNames: string[];
  /** Callback invoked when user clicks "加入" on a suggestion.
   *  Parent is responsible for calling createTagAction + updating form state. */
  onApply: (tagName: string) => void;
  /** Optional: collapse by default on mobile. */
  collapsible?: boolean;
}

/**
 * Post-save tag suggestion panel. Calls `suggestTagsAction` on mount
 * and renders chips for rules + LLM suggestions. Degrades silently when
 * the action returns empty (no panel rendered).
 */
export function TagSuggestionsPanel({
  cardDraft,
  selectedTagNames,
  onApply,
}: TagSuggestionsPanelProps) {
  const [chips, setChips] = useState<TagChip[] | null>(null); // null = loading
  const [failed, setFailed] = useState(false);
  const calledRef = useRef(false);

  useEffect(() => {
    // Guard against StrictMode double-mount.
    if (calledRef.current) return;
    calledRef.current = true;

    let cancelled = false;

    suggestTagsAction({ cardDraft })
      .then((res) => {
        if (cancelled) return;
        if (res?.serverError || !res?.data) {
          setFailed(true);
          return;
        }
        const { rules, llm } = res.data;
        const selectedLower = new Set(selectedTagNames.map((n) => n.toLowerCase()));

        // Build chips, skipping already-selected tags.
        const seen = new Set<string>();
        const next: TagChip[] = [];

        for (const name of rules) {
          if (seen.has(name.toLowerCase()) || selectedLower.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          next.push({ name, source: "rules", applied: false });
        }
        for (const name of llm) {
          if (seen.has(name.toLowerCase()) || selectedLower.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());
          next.push({ name, source: "llm", applied: false });
        }

        setChips(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Degrade silently: hide when loading failed or no suggestions came back.
  if (failed) return null;
  if (chips !== null && chips.length === 0) return null;

  const handleApply = (name: string) => {
    setChips((prev) =>
      prev ? prev.map((c) => (c.name === name ? { ...c, applied: true } : c)) : prev,
    );
    onApply(name);
  };

  return (
    <section className={styles.panel} aria-label="建議標籤">
      <h3 className={styles.heading}>建議標籤</h3>
      {chips === null ? (
        <div className={styles.skeleton} aria-busy="true" aria-label="載入中" />
      ) : (
        <ul className={styles.chips} role="list">
          {chips.map((chip) => (
            <li key={chip.name} className={styles.chipItem}>
              <span className={styles.chip} data-applied={chip.applied || undefined}>
                <span className={styles.chipName}>{chip.name}</span>
                <span
                  className={styles.sourceBadge}
                  title={chip.source === "rules" ? "規則建議" : "AI 建議"}
                >
                  {chip.source === "rules" ? "規則" : "AI"}
                </span>
                {!chip.applied && (
                  <button
                    type="button"
                    className={styles.applyBtn}
                    onClick={() => handleApply(chip.name)}
                    aria-label={`加入標籤 ${chip.name}`}
                  >
                    加入
                  </button>
                )}
                {chip.applied && (
                  <span className={styles.appliedMark} aria-hidden="true">
                    ✓
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
