import type { Temperature } from "@/lib/cards/relationship-temp";

import styles from "./TemperatureBadge.module.css";

interface TemperatureBadgeProps {
  temperature: Temperature;
  /** Compact variant — emoji only with tooltip. Default false. */
  compact?: boolean;
}

/**
 * Visual relationship-temperature pill. Shows emoji + label by default;
 * compact mode collapses to emoji-only with the label as title attr,
 * for use in dense lists where horizontal space is tight.
 *
 * Uses level-derived class names so CSS can colour each tier subtly.
 */
export function TemperatureBadge({ temperature, compact = false }: TemperatureBadgeProps) {
  const className = `${styles.badge} ${styles[`level_${temperature.level}`] ?? ""}`.trim();
  const tooltip =
    temperature.daysSince === null
      ? temperature.label
      : `${temperature.label} · ${temperature.daysSince} 天前`;

  if (compact) {
    return (
      <span className={className} title={tooltip} aria-label={tooltip}>
        <span aria-hidden="true">{temperature.emoji}</span>
      </span>
    );
  }

  return (
    <span className={className} title={tooltip}>
      <span aria-hidden="true">{temperature.emoji}</span>
      <span className={styles.text}>{temperature.label}</span>
    </span>
  );
}
