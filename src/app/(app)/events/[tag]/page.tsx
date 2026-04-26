import Link from "next/link";
import { notFound } from "next/navigation";

import { TemperatureBadge } from "@/components/cards/TemperatureBadge";
import { listCardsForUser } from "@/db/cards";
import { computeTemperature } from "@/lib/cards/relationship-temp";
import { findEventBySlug } from "@/lib/events/group";
import { readSession } from "@/lib/firebase/session";
import { countFollowupsInCards } from "@/lib/timeline/followups";

import styles from "./event.module.css";

interface PageProps {
  params: Promise<{ tag: string }>;
}

const SCAN_LIMIT = 500;

export async function generateMetadata({ params }: PageProps) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  return { title: decoded || "場合" };
}

function cardName(card: { nameZh?: string; nameEn?: string }): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function formatYmd(raw: string | undefined): string {
  if (!raw) return "—";
  return raw;
}

export default async function EventDetailPage({ params }: PageProps) {
  const user = await readSession();
  if (!user) return null;
  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag);

  const cards = await listCardsForUser(user.uid, {
    limit: SCAN_LIMIT,
    orderBy: "createdAt",
    order: "desc",
  });
  const group = findEventBySlug(cards, tag);
  if (!group) notFound();

  // Companies seen at this event — useful "who else was there from
  // ACME" context.
  const companies = Array.from(
    new Set(
      group.cards.map((c) => c.companyZh || c.companyEn || "").filter((s) => s.trim().length > 0),
    ),
  );
  const followupCount = countFollowupsInCards(group.cards, new Date());

  return (
    <article className={styles.article}>
      <nav aria-label="Breadcrumbs" className={styles.crumbs}>
        <Link href="/cards">名片冊</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/events">場合</Link>
        <span aria-hidden="true"> · </span>
        <span>{group.displayName}</span>
      </nav>

      <header className={styles.header}>
        <p className={styles.kicker}>場合</p>
        <h1 className={styles.title}>{group.displayName}</h1>
        <p className={styles.lead}>
          {group.cards.length} 位聯絡人
          {followupCount > 0 && (
            <>
              {" · "}
              <Link href="/followups" className={styles.urgency}>
                ⏰ {followupCount} 該追蹤
              </Link>
            </>
          )}
          {companies.length > 0 && <> · 公司：{companies.join("、")}</>}
        </p>
      </header>

      <ul className={styles.cardList}>
        {group.cards.map((card) => {
          const role = card.jobTitleZh || card.jobTitleEn;
          const company = card.companyZh || card.companyEn;
          return (
            <li key={card.id}>
              <Link href={`/cards/${card.id}`} className={styles.cardRow}>
                <div className={styles.cardMain}>
                  <h2 className={styles.cardName}>{cardName(card)}</h2>
                  {(role || company) && (
                    <p className={styles.cardRole}>{[role, company].filter(Boolean).join(" · ")}</p>
                  )}
                  {card.whyRemember && <p className={styles.why}>{card.whyRemember}</p>}
                </div>
                <div className={styles.cardSide}>
                  <TemperatureBadge temperature={computeTemperature(card, new Date())} compact />
                  <span className={styles.metDate}>見面日：{formatYmd(card.firstMetDate)}</span>
                  {card.firstMetContext && (
                    <span className={styles.context}>{card.firstMetContext}</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
