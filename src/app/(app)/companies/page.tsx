import Link from "next/link";

import { CompanyList, type CompanyListItem } from "@/components/companies/CompanyList";
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
  const rawGroups = groupCardsByCompany(cards);
  const now = new Date();

  // Decorate, sort (urgency first then recency), and project to the
  // serializable shape the client list component consumes.
  const items: CompanyListItem[] = rawGroups
    .map((g) => ({ group: g, followupCount: countFollowupsInCards(g.cards, now) }))
    .sort((a, b) => {
      if (a.followupCount !== b.followupCount) return b.followupCount - a.followupCount;
      const aTouch = a.group.mostRecentTouch?.getTime() ?? 0;
      const bTouch = b.group.mostRecentTouch?.getTime() ?? 0;
      return bTouch - aTouch;
    })
    .map(({ group, followupCount }) => {
      const head = group.cards[0];
      const headRole = head?.jobTitleZh || head?.jobTitleEn;
      return {
        slug: group.slug,
        displayName: group.displayName,
        count: group.cards.length,
        mostRecentTouchYmd: formatYmd(group.mostRecentTouch),
        headName: head ? cardName(head) : undefined,
        headRole,
        followupCount,
      };
    });

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
          <em>{items.length}</em> 家公司
        </h1>
        {items.length > 0 ? (
          <p className={styles.lead}>
            該追蹤的公司排前面，其他按最近互動排序。點進去看同公司的所有人、彼此職位、互動歷史。
          </p>
        ) : (
          <p className={styles.lead}>
            還沒有名片標註公司資訊。建立名片時填入公司名稱，這裡會自動聚合。
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
        <CompanyList items={items} />
      )}
    </article>
  );
}
