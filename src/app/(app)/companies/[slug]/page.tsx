import Link from "next/link";
import { notFound } from "next/navigation";

import { listCardsForUser } from "@/db/cards";
import { findCompanyBySlug } from "@/lib/companies/group";
import { readSession } from "@/lib/firebase/session";

import styles from "./company.module.css";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const SCAN_LIMIT = 500;

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  return { title: decoded || "公司" };
}

function cardName(card: { nameZh?: string; nameEn?: string }): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function formatYmd(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("zh-Hant", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const user = await readSession();
  if (!user) return null;
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const cards = await listCardsForUser(user.uid, {
    limit: SCAN_LIMIT,
    orderBy: "createdAt",
    order: "desc",
  });
  const group = findCompanyBySlug(cards, slug);
  if (!group) notFound();

  const totalContacted = group.cards.filter((c) => c.lastContactedAt).length;
  const sharedEvents = Array.from(
    new Set(group.cards.map((c) => c.firstMetEventTag).filter(Boolean) as string[]),
  );

  return (
    <article className={styles.article}>
      <nav aria-label="Breadcrumbs" className={styles.crumbs}>
        <Link href="/cards">名片冊</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/companies">公司</Link>
        <span aria-hidden="true"> · </span>
        <span>{group.displayName}</span>
      </nav>

      <header className={styles.header}>
        <p className={styles.kicker}>公司</p>
        <h1 className={styles.title}>{group.displayName}</h1>
        <p className={styles.lead}>
          {group.cards.length} 位聯絡人 · {totalContacted} 位有互動紀錄
          {sharedEvents.length > 0 && <> · 認識場合：{sharedEvents.join("、")}</>}
        </p>
        <div className={styles.headerActions}>
          <a
            href={`/api/companies/${encodeURIComponent(group.slug)}/vcard`}
            className={styles.exportBtn}
            download
          >
            📤 匯出全部 {group.cards.length} 位 vCard
          </a>
        </div>
      </header>

      <ul className={styles.cardList}>
        {group.cards.map((card) => {
          const role = card.jobTitleZh || card.jobTitleEn;
          const dept = card.department;
          const phone = card.phones?.[0]?.value;
          const email = card.emails?.[0]?.value;
          return (
            <li key={card.id}>
              <Link href={`/cards/${card.id}`} className={styles.cardRow}>
                <div className={styles.cardMain}>
                  <h2 className={styles.cardName}>{cardName(card)}</h2>
                  {(role || dept) && (
                    <p className={styles.cardRole}>{[role, dept].filter(Boolean).join(" · ")}</p>
                  )}
                  {card.whyRemember && <p className={styles.why}>{card.whyRemember}</p>}
                </div>
                <div className={styles.cardSide}>
                  {card.isPinned && (
                    <span className={styles.pin} title="重要聯絡人">
                      📍
                    </span>
                  )}
                  {card.followUpAt && (
                    <span className={styles.followUp} title="待聯絡">
                      📅 {card.followUpAt.toISOString().slice(5, 10)}
                    </span>
                  )}
                  <span className={styles.lastTouch}>
                    上次互動：{formatYmd(card.lastContactedAt)}
                  </span>
                  {phone && <span className={styles.contact}>{phone}</span>}
                  {email && <span className={styles.contact}>{email}</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
