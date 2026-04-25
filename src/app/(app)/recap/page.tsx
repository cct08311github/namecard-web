import Link from "next/link";

import { RecapList } from "@/components/recap/RecapList";
import { listRecentContactEventsForUser } from "@/db/cards";
import { readSession } from "@/lib/firebase/session";
import { groupRecapByDay } from "@/lib/recap/group";

import styles from "./recap.module.css";

export const metadata = {
  title: "對話日誌",
};

export default async function RecapPage() {
  const user = await readSession();
  if (!user) return null;

  const items = await listRecentContactEventsForUser(user.uid, 14);
  const groups = groupRecapByDay(items, new Date());

  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>📓 對話日誌</p>
        <h1 className={styles.title}>
          最近 14 天，你<em>跟誰聊了什麼</em>
        </h1>
        <p className={styles.lead}>
          每筆 /log 速記在這裡都看得到。下次見面前掃一眼，就知道上次談到哪。
        </p>
      </header>

      {groups.length === 0 ? (
        <section className={styles.empty}>
          <p className={styles.emptyLead}>
            還沒有任何對話記錄。剛跟人聊完？去
            <Link href="/log">/log 對話速記</Link>留一筆。
          </p>
        </section>
      ) : (
        <RecapList groups={groups} />
      )}
    </article>
  );
}
