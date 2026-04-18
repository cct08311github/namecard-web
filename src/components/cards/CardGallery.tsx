import Link from "next/link";

import type { CardSummary } from "@/db/cards";

import styles from "./CardGallery.module.css";

interface CardGalleryProps {
  cards: CardSummary[];
}

function primaryName(card: CardSummary): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function secondaryName(card: CardSummary): string | null {
  if (card.nameZh && card.nameEn) return card.nameEn;
  return null;
}

function company(card: CardSummary): string | null {
  return card.companyZh || card.companyEn || null;
}

function role(card: CardSummary): string | null {
  return card.jobTitleZh || card.jobTitleEn || null;
}

/** Deterministic small tilt per card so the layout looks editorial, not stock. */
function tiltFor(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) | 0;
  const magnitude = (sum % 5) - 2; // -2..2 degrees
  return magnitude * 0.5;
}

export function CardGallery({ cards }: CardGalleryProps) {
  return (
    <ul className={styles.grid}>
      {cards.map((card, index) => {
        const tilt = tiltFor(card.id);
        const isFeatured = index % 7 === 0 && cards.length > 6;
        return (
          <li
            key={card.id}
            className={`${styles.item} ${isFeatured ? styles.featured : ""}`}
            style={{ "--tilt": `${tilt}deg` } as React.CSSProperties}
          >
            <Link href={`/cards/${card.id}`} className={styles.link}>
              <article className={styles.card}>
                <header className={styles.cardHeader}>
                  <h2 className={styles.name}>{primaryName(card)}</h2>
                  {secondaryName(card) && <p className={styles.nameEn}>{secondaryName(card)}</p>}
                  {role(card) && <p className={styles.role}>{role(card)}</p>}
                  {company(card) && <p className={styles.company}>{company(card)}</p>}
                </header>
                {card.whyRemember && (
                  <blockquote className={styles.why}>{card.whyRemember}</blockquote>
                )}
                <footer className={styles.cardFooter}>
                  {card.firstMetEventTag ? (
                    <span className={styles.eventTag}>@ {card.firstMetEventTag}</span>
                  ) : card.firstMetDate ? (
                    <span className={styles.eventTag}>{card.firstMetDate}</span>
                  ) : null}
                </footer>
              </article>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
