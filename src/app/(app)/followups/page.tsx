import Link from "next/link";

import { ActionItemsSection } from "@/components/coach/ActionItemsSection";
import { FollowupCardRow } from "@/components/followups/FollowupCardRow";
import { listCardsForUser } from "@/db/cards";
import { isCoachConfigured } from "@/lib/coach/llm";
import { reminderDateLabel } from "@/lib/cards/reminder-label";
import { readSession } from "@/lib/firebase/session";
import {
  bucketFollowups,
  dueRemindersToday,
  totalFollowups,
  upcomingRemindersThisWeek,
  type FollowupBucket,
} from "@/lib/timeline/followups";
// /followups uses bucketFollowups+dueRemindersToday directly (it
// renders each bucket separately), not the count-only helper.

import styles from "./followups.module.css";

export const metadata = {
  title: "追蹤",
};

export default async function FollowupsPage() {
  const user = await readSession();
  if (!user) return null;

  const cards = await listCardsForUser(user.uid, {
    limit: 200,
    orderBy: "createdAt",
    order: "desc",
  });
  const now = new Date();
  const groups = bucketFollowups(cards, now);
  // Explicit reminders the user committed to with the picker. Conceptually
  // separate from staleness, so they get their own top section instead of
  // being merged into one of the existing buckets.
  const reminders = dueRemindersToday(cards, now);
  // Upcoming-week reminders are visibility-only (not added to the
  // urgency total) — they're scheduled future commitments, not action
  // items overdue today.
  const upcoming = upcomingRemindersThisWeek(cards, now);
  const total = totalFollowups(groups) + reminders.length;
  const showAiDrafts = isCoachConfigured();

  const ordered: FollowupBucket[] = [
    groups.pinnedStale,
    groups.critical,
    groups.overdue,
    groups.due,
  ];

  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>追蹤</p>
        <h1 className={styles.title}>
          {total === 0 ? "全部都跟上了。" : <>有 {total} 個人該 ping 了。</>}
        </h1>
        <p className={styles.subtitle}>
          按急迫度排序。點 <em>✅ 已聯絡</em> 會把這個人從清單裡拿掉。
        </p>
      </header>

      {showAiDrafts && <ActionItemsSection />}

      {reminders.length > 0 && (
        <section className={styles.bucket} aria-label="今日提醒">
          <header className={styles.bucketHeader}>
            <h2 className={styles.bucketTitle}>
              今日提醒
              <span className={styles.bucketCount}>{reminders.length}</span>
            </h2>
            <p className={styles.bucketDesc}>你預先排好的聯絡日已到。</p>
          </header>
          <ol className={styles.list}>
            {reminders.map(({ card, days }) => (
              <FollowupCardRow
                key={card.id}
                card={card}
                days={days}
                daysLabel={
                  card.followUpAt ? `📅 ${reminderDateLabel(card.followUpAt, now)}` : undefined
                }
                showAiDrafts={showAiDrafts}
              />
            ))}
          </ol>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className={styles.bucket} aria-label="下週提醒">
          <header className={styles.bucketHeader}>
            <h2 className={styles.bucketTitle}>
              下週提醒
              <span className={styles.bucketCount}>{upcoming.length}</span>
            </h2>
            <p className={styles.bucketDesc}>未來 7 天內到期的提醒，先看一眼。</p>
          </header>
          <ol className={styles.list}>
            {upcoming.map(({ card, days }) => (
              <FollowupCardRow
                key={card.id}
                card={card}
                days={days}
                daysLabel={
                  card.followUpAt ? `📅 ${reminderDateLabel(card.followUpAt, now)}` : undefined
                }
                showAiDrafts={showAiDrafts}
              />
            ))}
          </ol>
        </section>
      )}

      {total === 0 && upcoming.length === 0 ? (
        <section className={styles.empty}>
          <p className={styles.emptyBody}>
            沒有人在排隊等你追蹤。想提前找點人接觸？到
            <Link href="/cards" className={styles.link}>
              {" "}
              名片冊
            </Link>{" "}
            切「最近聯絡」排序看看。
          </p>
        </section>
      ) : total === 0 ? null : (
        ordered
          .filter((b) => b.cards.length > 0)
          .map((bucket) => (
            <section key={bucket.id} className={styles.bucket} aria-label={bucket.title}>
              <header className={styles.bucketHeader}>
                <h2 className={styles.bucketTitle}>
                  {bucket.title}
                  <span className={styles.bucketCount}>{bucket.cards.length}</span>
                </h2>
                <p className={styles.bucketDesc}>{bucket.description}</p>
              </header>
              <ol className={styles.list}>
                {bucket.cards.map(({ card, days }) => (
                  <FollowupCardRow
                    key={card.id}
                    card={card}
                    days={days}
                    showAiDrafts={showAiDrafts}
                  />
                ))}
              </ol>
            </section>
          ))
      )}
    </article>
  );
}
