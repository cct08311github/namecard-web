import Link from "next/link";

import type { CardSummary } from "@/db/cards";
import { computeTemperature } from "@/lib/cards/relationship-temp";
import { daysSinceContact, shouldShowStaleBadge } from "@/lib/timeline/staleness";

import styles from "./CardList.module.css";
import { TemperatureBadge } from "./TemperatureBadge";
import type { CardSelectionApi } from "./useCardSelection";

interface CardListProps {
  cards: CardSummary[];
  /** When provided, rows render as toggles instead of navigation links. */
  selection?: CardSelectionApi;
  /** Optional cardId → signed-URL map for thumbnail rendering. */
  imageUrls?: Record<string, string>;
}

function primaryName(card: CardSummary): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function company(card: CardSummary): string | null {
  return card.companyZh || card.companyEn || null;
}

function role(card: CardSummary): string | null {
  return card.jobTitleZh || card.jobTitleEn || null;
}

export function CardList({ cards, selection, imageUrls }: CardListProps) {
  // Compute now once per render so staleness is stable across the list and
  // doesn't diverge between items rendered a few ms apart.
  const now = new Date();
  return (
    <ol className={styles.list}>
      {cards.map((card) => {
        const stale = shouldShowStaleBadge(card, now);
        const days = stale ? daysSinceContact(card, now) : null;
        const checked = selection?.isSelected(card.id) ?? false;
        const temperature = computeTemperature(card, now);
        const thumbUrl = imageUrls?.[card.id];
        const inner = (
          <>
            {selection && (
              <span
                className={`${styles.checkbox} ${checked ? styles.checked : ""}`}
                aria-hidden="true"
              >
                {checked ? "✓" : ""}
              </span>
            )}
            <div className={styles.primaryRow}>
              {thumbUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl}
                  alt=""
                  className={styles.thumb}
                  loading="lazy"
                  decoding="async"
                  aria-hidden="true"
                />
              )}
              <div className={styles.primary}>
                {card.isPinned && (
                  <span className={styles.pinBadge} aria-label="重要聯絡人" title="重要聯絡人">
                    📍
                  </span>
                )}
                <span className={styles.name}>{primaryName(card)}</span>
                {role(card) && <span className={styles.role}>{role(card)}</span>}
                {company(card) && <span className={styles.company}>{company(card)}</span>}
                <TemperatureBadge temperature={temperature} compact />
              </div>
            </div>
            <p className={styles.why}>{card.whyRemember}</p>
            <div className={styles.meta}>
              {card.firstMetEventTag && (
                <span className={styles.event}>@ {card.firstMetEventTag}</span>
              )}
              {card.firstMetDate && <span className={styles.date}>{card.firstMetDate}</span>}
              {stale && days !== null && <span className={styles.staleBadge}>{days} 天沒聯絡</span>}
            </div>
          </>
        );
        return (
          <li key={card.id} className={`${styles.row} ${checked ? styles.rowSelected : ""}`}>
            {selection ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={`選取 ${primaryName(card)}`}
                className={`${styles.link} ${styles.toggleBtn}`}
                onClick={() => selection.toggle(card.id)}
              >
                {inner}
              </button>
            ) : (
              <Link href={`/cards/${card.id}`} className={styles.link}>
                {inner}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
