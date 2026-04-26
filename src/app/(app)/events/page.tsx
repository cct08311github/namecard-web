import Link from "next/link";

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

  // Decorate with follow-up count and hybrid-sort: groups that need
  // attention come first (by count desc), the rest keep mostRecentMet
  // ordering. Same pattern as /companies.
  const groups = rawGroups
    .map((g) => ({ group: g, followupCount: countFollowupsInCards(g.cards, now) }))
    .sort((a, b) => {
      if (a.followupCount !== b.followupCount) return b.followupCount - a.followupCount;
      const aTouch = a.group.mostRecentMet?.getTime() ?? 0;
      const bTouch = b.group.mostRecentMet?.getTime() ?? 0;
      return bTouch - aTouch;
    });

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
          <em>{groups.length}</em> 個場合
        </h1>
        {groups.length > 0 ? (
          <p className={styles.lead}>
            該追蹤的場合排前面，其他按最近見面排序。點進去看那場見過誰、職位、為什麼記得。
          </p>
        ) : (
          <p className={styles.lead}>
            還沒有名片標註「第一次見面場合」。建立或編輯名片時填入場合，這裡會自動聚合。
          </p>
        )}
      </header>

      {groups.length === 0 ? (
        <section className={styles.empty}>
          <Link href="/cards/new" className={styles.backLink}>
            建立第一張名片 →
          </Link>
        </section>
      ) : (
        <ul className={styles.eventList}>
          {groups.map(({ group, followupCount }) => {
            return (
              <li key={group.slug}>
                <Link
                  href={`/events/${encodeURIComponent(group.slug)}`}
                  className={styles.eventRow}
                >
                  <div className={styles.eventMain}>
                    <h2 className={styles.eventName}>
                      {group.displayName}
                      {followupCount > 0 && (
                        <span
                          className={styles.followupBadge}
                          aria-label={`${followupCount} 個人該 ping 了`}
                        >
                          ⏰ {followupCount}
                        </span>
                      )}
                    </h2>
                    <p className={styles.eventMeta}>
                      {group.cards.length} 位 · 最近見面：{formatYmd(group.mostRecentMet)}
                    </p>
                  </div>
                  <span className={styles.chevron} aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
