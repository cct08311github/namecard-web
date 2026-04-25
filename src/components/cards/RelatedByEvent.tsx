import Link from "next/link";

import type { CardSummary } from "@/db/cards";

import styles from "./RelatedByEvent.module.css";

interface RelatedByEventProps {
  eventTag: string;
  cards: CardSummary[];
}

/**
 * Sidebar block on /cards/[id] surfacing other contacts met at the same
 * event (matched by firstMetEventTag). Renders nothing when the list
 * is empty so we don't show a depressing "no one else" placeholder.
 */
export function RelatedByEvent({ eventTag, cards }: RelatedByEventProps) {
  if (cards.length === 0) return null;
  return (
    <section className={styles.section} aria-label={`${eventTag} 認識的其他人`}>
      <header className={styles.header}>
        <p className={styles.kicker}>同場合認識</p>
        <h3 className={styles.title}>{eventTag}</h3>
        <p className={styles.count}>另外 {cards.length} 位</p>
      </header>
      <ul className={styles.list}>
        {cards.map((c) => {
          const name = c.nameZh || c.nameEn || "（未命名）";
          const sub = [c.jobTitleZh || c.jobTitleEn, c.companyZh || c.companyEn]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={c.id} className={styles.row}>
              <Link href={`/cards/${c.id}`} className={styles.link}>
                <span className={styles.name}>{name}</span>
                {sub && <span className={styles.sub}>{sub}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
