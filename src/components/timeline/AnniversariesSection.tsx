import { FollowupCardRow } from "@/components/followups/FollowupCardRow";
import type { CardSummary } from "@/db/cards";
import { findAnniversariesToday } from "@/lib/timeline/anniversaries";
import type { TimelineSection as TimelineSectionData } from "@/lib/timeline/categorize";
import { daysSinceContact } from "@/lib/timeline/staleness";

import styles from "./TimelineSection.module.css";

interface AnniversariesSectionProps {
  section: TimelineSectionData;
  now: Date;
  showAiDrafts?: boolean;
}

/**
 * Home-page rendering of the `anniversaries` timeline section using
 * FollowupCardRow — same actionable UX (📧📞💬 + ✅ + picker) as
 * due-today (PR #183). Per-row label shows the anniversary year
 * count (「🎉 1 年」 / 「🎉 5 年」).
 *
 * The section.cards list comes pre-filtered from categorizeTimeline,
 * so we only re-run findAnniversariesToday over those cards to recover
 * the lost `years` field — cheap because the list is small (typically
 * 0-3 cards).
 */
export function AnniversariesSection({
  section,
  now,
  showAiDrafts = false,
}: AnniversariesSectionProps) {
  if (section.cards.length === 0) return null;

  // Recover years per card (categorizeTimeline drops the per-entry
  // metadata when it builds section.cards as plain CardSummary[]).
  const yearsByCard = new Map<string, number>();
  for (const entry of findAnniversariesToday(section.cards, now)) {
    yearsByCard.set(entry.card.id, entry.years);
  }

  return (
    <section className={styles.section} aria-labelledby={`section-${section.id}`}>
      <header className={styles.header}>
        <h2 id={`section-${section.id}`} className={styles.title}>
          {section.title}
        </h2>
        <p className={styles.description}>{section.description}</p>
      </header>
      <ol className={styles.actionableList}>
        {section.cards.map((card: CardSummary) => {
          const years = yearsByCard.get(card.id) ?? 1;
          return (
            <FollowupCardRow
              key={card.id}
              card={card}
              days={daysSinceContact(card, now) ?? 0}
              daysLabel={`🎉 ${years} 年`}
              showAiDrafts={showAiDrafts}
            />
          );
        })}
      </ol>
    </section>
  );
}
