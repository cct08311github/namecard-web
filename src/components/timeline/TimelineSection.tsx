import Link from "next/link";

import { TemperatureBadge } from "@/components/cards/TemperatureBadge";
import type { CardSummary } from "@/db/cards";
import { computeTemperature } from "@/lib/cards/relationship-temp";
import type { TimelineSection as TimelineSectionData } from "@/lib/timeline/categorize";

import styles from "./TimelineSection.module.css";

interface TimelineSectionProps {
  section: TimelineSectionData;
}

function primaryName(card: CardSummary): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function subline(card: CardSummary): string {
  const parts: string[] = [];
  const role = card.jobTitleZh || card.jobTitleEn;
  const company = card.companyZh || card.companyEn;
  if (role) parts.push(role);
  if (company) parts.push(company);
  return parts.join(" · ");
}

function formatDaysAgo(when: Date | null): string | null {
  if (!when) return null;
  const diff = Date.now() - when.getTime();
  const days = Math.round(diff / (24 * 60 * 60 * 1000));
  if (days < 1) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 週前`;
  if (days < 365) return `${Math.floor(days / 30)} 個月前`;
  return `${Math.floor(days / 365)} 年前`;
}

function sectionMeta(section: TimelineSectionData, card: CardSummary): string | null {
  if (section.id === "uncontacted") {
    const when = card.lastContactedAt ?? card.createdAt;
    const phrase = formatDaysAgo(when);
    return phrase ? `上次互動：${phrase}` : null;
  }
  if (section.id === "met-this-month") {
    return card.firstMetDate ?? null;
  }
  if (section.id === "newly-added") {
    return formatDaysAgo(card.createdAt);
  }
  return null;
}

export function TimelineSection({ section }: TimelineSectionProps) {
  if (section.cards.length === 0) return null;
  // Compute `now` once per render so all rows share the same reference
  // moment (otherwise tens of microsecond drifts between calls could
  // straddle a daysSince boundary).
  const now = new Date();
  return (
    <section className={styles.section} aria-labelledby={`section-${section.id}`}>
      <header className={styles.header}>
        <h2 id={`section-${section.id}`} className={styles.title}>
          {section.title}
        </h2>
        <p className={styles.description}>{section.description}</p>
      </header>
      <ol className={styles.list}>
        {section.cards.map((card) => (
          <li key={card.id}>
            <Link href={`/cards/${card.id}`} className={styles.row}>
              <div className={styles.who}>
                <span className={styles.nameRow}>
                  <span className={styles.name}>{primaryName(card)}</span>
                  <TemperatureBadge temperature={computeTemperature(card, now)} compact />
                </span>
                {subline(card) && <span className={styles.sub}>{subline(card)}</span>}
              </div>
              <p className={styles.why}>{card.whyRemember}</p>
              <span className={styles.meta}>{sectionMeta(section, card)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
