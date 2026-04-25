"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import type { TemperatureLevel } from "@/lib/cards/relationship-temp";

import styles from "./TemperatureFilterBar.module.css";

interface TemperatureFilterBarProps {
  /** Pre-computed counts per level (over the current tag-filtered list). */
  counts: Record<TemperatureLevel, number>;
  /** Currently selected levels (empty = no filter). */
  selected: readonly TemperatureLevel[];
}

const ORDER: ReadonlyArray<{ level: TemperatureLevel; emoji: string; short: string }> = [
  { level: "hot", emoji: "🔥", short: "本週" },
  { level: "warm", emoji: "✨", short: "本月" },
  { level: "active", emoji: "💫", short: "近 3 月" },
  { level: "quiet", emoji: "🌙", short: "半年內" },
  { level: "cold", emoji: "💤", short: "冷" },
];

const LEVEL_LABELS: Record<TemperatureLevel, string> = {
  hot: "本週聯絡過",
  warm: "本月聯絡過",
  active: "近 3 個月聯絡過",
  quiet: "近半年聯絡過",
  cold: "超過半年未聯絡或從未聯絡",
};

/**
 * Filter chips alongside the existing tag bar. Reads/writes URL state
 * (`?temp=cold,quiet`) so a filtered view is shareable + survives a
 * page reload. OR semantics: any chip selected = show that tier.
 */
export function TemperatureFilterBar({ counts, selected }: TemperatureFilterBarProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const selectedSet = new Set<TemperatureLevel>(selected);

  const setLevels = (next: TemperatureLevel[]) => {
    const sp = new URLSearchParams(params.toString());
    if (next.length === 0) sp.delete("temp");
    else sp.set("temp", next.join(","));
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `/cards?${qs}` : "/cards", { scroll: false });
    });
  };

  const toggle = (level: TemperatureLevel) => {
    const next = selectedSet.has(level)
      ? selected.filter((l) => l !== level)
      : [...selected, level];
    setLevels(next);
  };

  const clear = () => setLevels([]);

  const totalSelected = selected.length;

  return (
    <div className={styles.bar} aria-label="關係溫度篩選">
      <ul className={styles.chipList}>
        {ORDER.map(({ level, emoji, short }) => {
          const count = counts[level] ?? 0;
          const active = selectedSet.has(level);
          const tooltip = `${LEVEL_LABELS[level]} · ${count} 張`;
          const className = `${styles.chip} ${active ? styles.chipActive : ""} ${
            count === 0 ? styles.chipEmpty : ""
          }`.trim();
          return (
            <li key={level}>
              <button
                type="button"
                className={className}
                onClick={() => toggle(level)}
                disabled={pending || count === 0}
                aria-pressed={active}
                title={tooltip}
              >
                <span aria-hidden="true">{emoji}</span>
                <span className={styles.chipShort}>{short}</span>
                <span className={styles.chipCount}>{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {totalSelected > 0 && (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={clear}
          disabled={pending}
          title="清除溫度篩選"
        >
          清除
        </button>
      )}
    </div>
  );
}
