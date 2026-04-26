import { FollowupCardRow } from "@/components/followups/FollowupCardRow";
import { reminderDateLabel } from "@/lib/cards/reminder-label";
import type { TimelineSection as TimelineSectionData } from "@/lib/timeline/categorize";
import { daysSinceContact } from "@/lib/timeline/staleness";

import styles from "./TimelineSection.module.css";

interface DueTodaySectionProps {
  section: TimelineSectionData;
  now: Date;
  showAiDrafts?: boolean;
}

/**
 * Home-page rendering of the `due-today` timeline section using
 * FollowupCardRow (mailto/tel/LINE quick-actions, ✅ 已聯絡, inline next
 * picker) instead of the passive TimelineSection link layout. Keeps
 * /home and /followups visually consistent for the same data.
 */
export function DueTodaySection({ section, now, showAiDrafts = false }: DueTodaySectionProps) {
  if (section.cards.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby={`section-${section.id}`}>
      <header className={styles.header}>
        <h2 id={`section-${section.id}`} className={styles.title}>
          {section.title}
        </h2>
        <p className={styles.description}>{section.description}</p>
      </header>
      <ol className={styles.actionableList}>
        {section.cards.map((card) => (
          <FollowupCardRow
            key={card.id}
            card={card}
            days={daysSinceContact(card, now) ?? 0}
            daysLabel={
              card.followUpAt ? `📅 ${reminderDateLabel(card.followUpAt, now)}` : "📅 今天"
            }
            showAiDrafts={showAiDrafts}
          />
        ))}
      </ol>
    </section>
  );
}
