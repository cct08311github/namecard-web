import Link from "next/link";

import { FollowupCardRow } from "@/components/followups/FollowupCardRow";
import { listCardsForUser } from "@/db/cards";
import { readSession } from "@/lib/firebase/session";
import { bucketFollowups, totalFollowups, type FollowupBucket } from "@/lib/timeline/followups";

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
  const groups = bucketFollowups(cards, new Date());
  const total = totalFollowups(groups);

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

      {total === 0 ? (
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
      ) : (
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
                  <FollowupCardRow key={card.id} card={card} days={days} />
                ))}
              </ol>
            </section>
          ))
      )}
    </article>
  );
}
