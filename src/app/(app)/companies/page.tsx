import Link from "next/link";

import { listCardsForUser } from "@/db/cards";
import { groupCardsByCompany } from "@/lib/companies/group";
import { readSession } from "@/lib/firebase/session";
import { countFollowupsInCards } from "@/lib/timeline/followups";

import styles from "./companies.module.css";

export const metadata = {
  title: "公司",
};

const SCAN_LIMIT = 500;

function formatYmd(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("zh-Hant", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function cardName(card: { nameZh?: string; nameEn?: string }): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

export default async function CompaniesPage() {
  const user = await readSession();
  if (!user) return null;

  const cards = await listCardsForUser(user.uid, {
    limit: SCAN_LIMIT,
    orderBy: "createdAt",
    order: "desc",
  });
  const groups = groupCardsByCompany(cards);
  const now = new Date();

  return (
    <article className={styles.article}>
      <nav aria-label="Breadcrumbs" className={styles.crumbs}>
        <Link href="/cards">名片冊</Link>
        <span aria-hidden="true"> · </span>
        <span>公司</span>
      </nav>

      <header className={styles.header}>
        <p className={styles.kicker}>公司視角</p>
        <h1 className={styles.title}>
          <em>{groups.length}</em> 家公司
        </h1>
        {groups.length > 0 ? (
          <p className={styles.lead}>
            按最近互動排序。點進去看同公司的所有人、彼此職位、互動歷史。
          </p>
        ) : (
          <p className={styles.lead}>
            還沒有名片標註公司資訊。建立名片時填入公司名稱，這裡會自動聚合。
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
        <ul className={styles.companyList}>
          {groups.map((group) => {
            const head = group.cards[0];
            const headRole = head?.jobTitleZh || head?.jobTitleEn;
            const followupCount = countFollowupsInCards(group.cards, now);
            return (
              <li key={group.slug}>
                <Link
                  href={`/companies/${encodeURIComponent(group.slug)}`}
                  className={styles.companyRow}
                >
                  <div className={styles.companyMain}>
                    <h2 className={styles.companyName}>
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
                    <p className={styles.companyMeta}>
                      {group.cards.length} 位 · 最近：{formatYmd(group.mostRecentTouch)}
                    </p>
                  </div>
                  {head && (
                    <div className={styles.headPreview}>
                      <span className={styles.headName}>{cardName(head)}</span>
                      {headRole && <span className={styles.headRole}>{headRole}</span>}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
