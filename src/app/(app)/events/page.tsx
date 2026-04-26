import Link from "next/link";

import { EventList, type EventListItem } from "@/components/events/EventList";
import { listCardsForUser } from "@/db/cards";
import { groupCardsByEvent } from "@/lib/events/group";
import { readSession } from "@/lib/firebase/session";
import { countFollowupsInCards } from "@/lib/timeline/followups";

import styles from "./events.module.css";

export const metadata = {
  title: "場合",
};

const SCAN_LIMIT = 500;

function formatYmd(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("zh-Hant", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function EventsPage() {
  const user = await readSession();
  if (!user) return null;

  const cards = await listCardsForUser(user.uid, {
    limit: SCAN_LIMIT,
    orderBy: "createdAt",
    order: "desc",
  });
  const rawGroups = groupCardsByEvent(cards);
  const now = new Date();

  // Decorate, sort (urgency first then recency), and project to the
  // serializable shape the client list component consumes.
  const items: EventListItem[] = rawGroups
    .map((g) => ({ group: g, followupCount: countFollowupsInCards(g.cards, now) }))
    .sort((a, b) => {
      if (a.followupCount !== b.followupCount) return b.followupCount - a.followupCount;
      const aTouch = a.group.mostRecentMet?.getTime() ?? 0;
      const bTouch = b.group.mostRecentMet?.getTime() ?? 0;
      return bTouch - aTouch;
    })
    .map(({ group, followupCount }) => ({
      slug: group.slug,
      displayName: group.displayName,
      count: group.cards.length,
      mostRecentMetYmd: formatYmd(group.mostRecentMet),
      followupCount,
    }));

  return (
    <article className={styles.article}>
      <nav aria-label="Breadcrumbs" className={styles.crumbs}>
        <Link href="/cards">名片冊</Link>
        <span aria-hidden="true"> · </span>
        <span>場合</span>
      </nav>

      <header className={styles.header}>
        <p className={styles.kicker}>場合視角</p>
        <h1 className={styles.title}>
          <em>{items.length}</em> 個場合
          {(() => {
            const needing = items.filter((i) => i.followupCount > 0).length;
            return needing > 0 ? (
              <span className={styles.subStat}> · 其中 {needing} 個有人該追蹤</span>
            ) : null;
          })()}
        </h1>
        {items.length > 0 ? (
          <p className={styles.lead}>
            該追蹤的場合排前面，其他按最近見面排序。點進去看那場見過誰、職位、為什麼記得。
          </p>
        ) : (
          <p className={styles.lead}>
            還沒有名片標註「第一次見面場合」。建立或編輯名片時填入場合，這裡會自動聚合。
          </p>
        )}
      </header>

      {items.length === 0 ? (
        <section className={styles.empty}>
          <Link href="/cards/new" className={styles.backLink}>
            建立第一張名片 →
          </Link>
        </section>
      ) : (
        <EventList items={items} />
      )}
    </article>
  );
}
