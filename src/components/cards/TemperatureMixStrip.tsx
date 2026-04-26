import type { TemperatureLevel } from "@/lib/cards/relationship-temp";

import styles from "./TemperatureMixStrip.module.css";

interface TemperatureMixStripProps {
  counts: Record<TemperatureLevel, number>;
}

const ORDER: readonly TemperatureLevel[] = ["hot", "warm", "active", "quiet", "cold"];

const EMOJI: Record<TemperatureLevel, string> = {
  hot: "🔥",
  warm: "✨",
  active: "💫",
  quiet: "🌙",
  cold: "💤",
};

const LABEL: Record<TemperatureLevel, string> = {
  hot: "hot",
  warm: "warm",
  active: "active",
  quiet: "quiet",
  cold: "cold",
};

/**
 * Inline distribution strip: "🔥 2 · ✨ 1 · 💤 2".
 * Only renders levels with count > 0 — keeps the strip minimal.
 * Used on /companies/[slug] and /events/[tag] headers to give a
 * quick read of the relationship-state mix per group.
 */
export function TemperatureMixStrip({ counts }: TemperatureMixStripProps) {
  const present = ORDER.filter((level) => counts[level] > 0);
  if (present.length === 0) return null;
  return (
    <span className={styles.strip} aria-label="Temperature distribution">
      {present.map((level, i) => (
        <span key={level} className={styles.entry}>
          {i > 0 && <span aria-hidden="true">·</span>}
          <span title={LABEL[level]}>
            {EMOJI[level]} {counts[level]}
          </span>
        </span>
      ))}
    </span>
  );
}
