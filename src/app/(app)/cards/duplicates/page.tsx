import Link from "next/link";

import { MergeGroup } from "@/components/cards/MergeGroup";
import { listCardsForUser } from "@/db/cards";
import { findDuplicateGroups } from "@/lib/cards/duplicates";
import { readSession } from "@/lib/firebase/session";

import styles from "./duplicates.module.css";

export const metadata = {
  title: "重複名片",
};

const SCAN_LIMIT = 500;

export default async function DuplicatesPage() {
  const user = await readSession();
  if (!user) return null;

  // Same 500-card ceiling as the bulk-edit toolbar — covers >99% of
  // personal address books without paginating. If a user ever crosses
  // this, we'll page from the most-recently-touched cards first since
  // duplicates almost always cluster around recent imports.
  const cards = await listCardsForUser(user.uid, {
    limit: SCAN_LIMIT,
    orderBy: "createdAt",
    order: "desc",
  });
  const groups = findDuplicateGroups(cards);

  const totalDuplicateCards = groups.reduce((sum, g) => sum + g.cards.length, 0);
  const reclaimable = groups.reduce((sum, g) => sum + (g.cards.length - 1), 0);

  return (
    <article className={styles.article}>
      <nav aria-label="Breadcrumbs" className={styles.crumbs}>
        <Link href="/cards">名片冊</Link>
        <span aria-hidden="true"> · </span>
        <span>重複名片</span>
      </nav>

      <header className={styles.header}>
        <p className={styles.kicker}>名片整理</p>
        <h1 className={styles.title}>
          <em>{groups.length}</em> 組可能重複
        </h1>
        {groups.length > 0 ? (
          <p className={styles.lead}>
            共 {totalDuplicateCards} 張卡集中在這些組別。合併後可釋出 <strong>{reclaimable}</strong>{" "}
            張的空間，並把所有電話、Email、標籤、互動歷史集中到
            一張卡上。被合併的卡會做軟刪除，可從備份還原。
          </p>
        ) : (
          <p className={styles.lead}>
            目前沒有偵測到重複名片。系統會自動偵測「共用 Email」或「同名同公司」的卡片
            並提示你合併。
          </p>
        )}
      </header>

      {groups.length === 0 ? (
        <section className={styles.empty} aria-live="polite">
          <p>名片冊乾淨無重複 ✨</p>
          <Link href="/cards" className={styles.backLink}>
            ← 回名片冊
          </Link>
        </section>
      ) : (
        <ol className={styles.groupList}>
          {groups.map((group) => (
            <li key={group.id}>
              <MergeGroup group={group} />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
