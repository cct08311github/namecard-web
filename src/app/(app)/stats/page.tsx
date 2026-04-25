import Link from "next/link";

import { StatCard } from "@/components/stats/StatCard";
import { TemperatureBadge } from "@/components/cards/TemperatureBadge";
import { listCardsForUser, listRecentContactEventsForUser } from "@/db/cards";
import { computeTemperature } from "@/lib/cards/relationship-temp";
import { readSession } from "@/lib/firebase/session";
import { aggregateStats } from "@/lib/stats/aggregate";

import styles from "./stats.module.css";

export const metadata = {
  title: "儀表板",
};

export default async function StatsPage() {
  const user = await readSession();
  if (!user) return null;

  const now = new Date();
  const [cards, events] = await Promise.all([
    listCardsForUser(user.uid, { limit: 1000 }),
    listRecentContactEventsForUser(user.uid, 30),
  ]);
  const stats = aggregateStats(cards, events, now);

  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>📊 儀表板</p>
        <h1 className={styles.title}>
          你的<em>關係健康</em>本週概況
        </h1>
        <p className={styles.lead}>
          本週對話、新人脈、溫度分布、連續 streak。資料來自 /log 累積的對話紀錄。
        </p>
      </header>

      <section aria-label="本週" className={styles.statBlock}>
        <h2 className={styles.blockTitle}>本週</h2>
        <div className={styles.grid}>
          <StatCard
            label="對話次數"
            value={stats.thisWeek.logCount}
            hint={`${stats.thisWeek.distinctPeople} 位不同的人`}
            emphasis="accent"
          />
          <StatCard label="新增名片" value={stats.thisWeek.newCardCount} hint="last 7 days" />
          <StatCard
            label="連續 streak"
            value={`${stats.streak.current} 天`}
            hint={`歷史最長 ${stats.streak.longest} 天`}
            emphasis={stats.streak.current > 0 ? "accent" : "default"}
          />
        </div>
      </section>

      <section aria-label="本月" className={styles.statBlock}>
        <h2 className={styles.blockTitle}>本月</h2>
        <div className={styles.grid}>
          <StatCard
            label="對話次數"
            value={stats.thisMonth.logCount}
            hint={`${stats.thisMonth.distinctPeople} 位不同的人`}
          />
          <StatCard label="新增名片" value={stats.thisMonth.newCardCount} hint="last 30 days" />
          <StatCard label="名片總數" value={stats.totalCards} hint="非刪除" />
        </div>
      </section>

      <section aria-label="溫度分布" className={styles.statBlock}>
        <h2 className={styles.blockTitle}>關係溫度分布</h2>
        <div className={styles.tempGrid}>
          <StatCard label="🔥 本週" value={stats.temperature.hot} />
          <StatCard label="✨ 本月" value={stats.temperature.warm} />
          <StatCard label="💫 近 3 月" value={stats.temperature.active} />
          <StatCard label="🌙 半年內" value={stats.temperature.quiet} />
          <StatCard label="💤 冷" value={stats.temperature.cold} />
        </div>
      </section>

      {stats.topPeople.length > 0 && (
        <section aria-label="本月最常聊到" className={styles.statBlock}>
          <h2 className={styles.blockTitle}>本月最常聊到</h2>
          <ol className={styles.topList}>
            {stats.topPeople.map((p) => (
              <li key={p.card.id} className={styles.topItem}>
                <Link href={`/cards/${p.card.id}`} className={styles.topName}>
                  {p.card.nameZh || p.card.nameEn || "（未命名）"}
                </Link>
                <span className={styles.topMeta}>
                  <TemperatureBadge temperature={computeTemperature(p.card, now)} compact />
                  <span className={styles.topCount}>{p.logCount} 次對話</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {stats.thisMonth.logCount === 0 && (
        <section className={styles.empty}>
          <p>
            本月還沒有任何 /log 紀錄。去 <Link href="/log">/log 對話速記</Link> 留第一筆吧。
          </p>
        </section>
      )}
    </article>
  );
}
