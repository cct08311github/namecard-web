"use client";

import { FollowupCardRow } from "@/components/followups/FollowupCardRow";
import type { TimelineSection as TimelineSectionData } from "@/lib/timeline/categorize";
import { daysSinceContact } from "@/lib/timeline/staleness";

import styles from "./TimelineSection.module.css";

interface UncontactedSectionProps {
  section: TimelineSectionData;
  now: Date;
  showAiDrafts?: boolean;
}

/**
 * Home-page rendering of the `uncontacted` timeline section using
 * FollowupCardRow — the same interactive component as DueTodaySection.
 *
 * This lets users mark a contact as contacted with one tap directly
 * from the home timeline, without navigating to the detail page first.
 * The uncontacted section is the highest-volume actionable item for
 * business users who open the app to triage their network each morning.
 */
export function UncontactedSection({
  section,
  now,
  showAiDrafts = false,
}: UncontactedSectionProps) {
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
        {section.cards.map((card) => {
          const days = daysSinceContact(card, now) ?? 0;
          return (
            <FollowupCardRow
              key={card.id}
              card={card}
              days={days}
              daysLabel={`${days} 天沒聯絡`}
              showAiDrafts={showAiDrafts}
            />
          );
        })}
      </ol>
    </section>
  );
}
