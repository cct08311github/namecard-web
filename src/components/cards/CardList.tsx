import Link from "next/link";

import type { CardSummary } from "@/db/cards";
import { daysSinceContact, shouldShowStaleBadge } from "@/lib/timeline/staleness";

import styles from "./CardList.module.css";

interface CardListProps {
  cards: CardSummary[];
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

export function CardList({ cards }: CardListProps) {
  // Compute now once per render so staleness is stable across the list and
  // doesn't diverge between items rendered a few ms apart.
  const now = new Date();
  return (
    <ol className={styles.list}>
      {cards.map((card) => {
        const stale = shouldShowStaleBadge(card, now);
        const days = stale ? daysSinceContact(card, now) : null;
        return (
          <li key={card.id} className={styles.row}>
            <Link href={`/cards/${card.id}`} className={styles.link}>
              <div className={styles.primary}>
                {card.isPinned && (
                  <span className={styles.pinBadge} aria-label="重要聯絡人" title="重要聯絡人">
                    📍
                  </span>
                )}
                <span className={styles.name}>{primaryName(card)}</span>
                {role(card) && <span className={styles.role}>{role(card)}</span>}
                {company(card) && <span className={styles.company}>{company(card)}</span>}
              </div>
              <p className={styles.why}>{card.whyRemember}</p>
              <div className={styles.meta}>
                {card.firstMetEventTag && (
                  <span className={styles.event}>@ {card.firstMetEventTag}</span>
                )}
                {card.firstMetDate && <span className={styles.date}>{card.firstMetDate}</span>}
                {stale && days !== null && (
                  <span className={styles.staleBadge}>{days} 天沒聯絡</span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
