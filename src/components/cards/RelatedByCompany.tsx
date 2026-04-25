import Link from "next/link";

import type { CardSummary } from "@/db/cards";

import styles from "./RelatedByCompany.module.css";

interface RelatedByCompanyProps {
  /** Display name of the company (canonical, not slugified). */
  companyName: string;
  /** URL slug for the company hub page. */
  companySlug: string;
  /** Up to N other contacts at the same company (excluding the focal card). */
  cards: CardSummary[];
  /** Total siblings at this company (may exceed `cards.length` if truncated). */
  totalSiblings: number;
}

/**
 * Sidebar block on /cards/[id] surfacing other contacts at the same
 * company. Mirrors the RelatedByEvent shape so the two related-blocks
 * read consistently. Renders nothing when no siblings.
 */
export function RelatedByCompany({
  companyName,
  companySlug,
  cards,
  totalSiblings,
}: RelatedByCompanyProps) {
  if (cards.length === 0) return null;
  const moreCount = Math.max(0, totalSiblings - cards.length);
  return (
    <section className={styles.section} aria-label={`${companyName} 同公司聯絡人`}>
      <header className={styles.header}>
        <p className={styles.kicker}>同公司</p>
        <h3 className={styles.title}>
          <Link href={`/companies/${encodeURIComponent(companySlug)}`} className={styles.titleLink}>
            {companyName}
          </Link>
        </h3>
        <p className={styles.count}>
          {totalSiblings} 位 ·{" "}
          <Link href={`/companies/${encodeURIComponent(companySlug)}`} className={styles.allLink}>
            看全部 →
          </Link>
        </p>
      </header>
      <ul className={styles.list}>
        {cards.map((c) => {
          const name = c.nameZh || c.nameEn || "（未命名）";
          const sub = [c.jobTitleZh || c.jobTitleEn, c.department].filter(Boolean).join(" · ");
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
      {moreCount > 0 && (
        <p className={styles.more}>
          還有 {moreCount} 位 ·{" "}
          <Link href={`/companies/${encodeURIComponent(companySlug)}`} className={styles.allLink}>
            看全部 →
          </Link>
        </p>
      )}
    </section>
  );
}
