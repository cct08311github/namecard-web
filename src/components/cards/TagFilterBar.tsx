"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

import type { TagSummary } from "@/db/tags";

import styles from "./TagFilterBar.module.css";

interface TagFilterBarProps {
  tags: TagSummary[];
  selectedIds: string[];
  tagMode: "or" | "and";
}

/**
 * Chips-based tag filter with AND/OR toggle. Writes to the URL so
 * the same filter is shareable and survives navigation (matches the
 * SearchBox URL-state contract).
 */
export function TagFilterBar({ tags, selectedIds, tagMode }: TagFilterBarProps) {
  const router = useRouter();
  const current = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  function navigateWith(nextSelected: string[], nextMode: "or" | "and") {
    const params = new URLSearchParams(current?.toString() ?? "");
    params.delete("tag");
    for (const id of nextSelected) params.append("tag", id);
    if (nextMode === "or") params.delete("tagMode");
    else params.set("tagMode", "and");
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `/cards?${qs}` : "/cards");
    });
  }

  function toggleTag(id: string) {
    const next = selected.has(id) ? selectedIds.filter((t) => t !== id) : [...selectedIds, id];
    navigateWith(next, tagMode);
  }

  function setMode(mode: "or" | "and") {
    if (mode === tagMode) return;
    navigateWith(selectedIds, mode);
  }

  function clearAll() {
    if (selectedIds.length === 0) return;
    navigateWith([], tagMode);
  }

  if (tags.length === 0) return null;

  return (
    <div className={styles.bar}>
      <div className={styles.chips}>
        {tags.map((tag) => {
          const active = selected.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ""}`}
              style={{ borderColor: tag.color }}
              onClick={() => toggleTag(tag.id)}
              disabled={pending}
              aria-pressed={active}
            >
              <span className={styles.dot} style={{ background: tag.color }} />
              {tag.name}
            </button>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <div className={styles.controls}>
          <div className={styles.modeGroup} role="radiogroup" aria-label="Tag match mode">
            <button
              type="button"
              className={`${styles.modeBtn} ${tagMode === "or" ? styles.modeActive : ""}`}
              onClick={() => setMode("or")}
              disabled={pending}
              aria-pressed={tagMode === "or"}
            >
              任一
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${tagMode === "and" ? styles.modeActive : ""}`}
              onClick={() => setMode("and")}
              disabled={pending}
              aria-pressed={tagMode === "and"}
            >
              全符合
            </button>
          </div>
          <button type="button" className={styles.clearBtn} onClick={clearAll} disabled={pending}>
            清除
          </button>
        </div>
      )}
    </div>
  );
}
