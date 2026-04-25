import Link from "next/link";
import { notFound } from "next/navigation";

import { CardActions } from "@/components/cards/CardActions";
import { CardChatBox } from "@/components/cards/CardChatBox";
import { CardInlineEdit } from "@/components/cards/CardInlineEdit";
import { CoachInsightSection } from "@/components/cards/CoachInsightSection";
import { ContactEventList } from "@/components/cards/ContactEventList";
import { TemperatureBadge } from "@/components/cards/TemperatureBadge";
import { PublicProfileToggle } from "@/components/cards/PublicProfileToggle";
import { RelatedByEvent } from "@/components/cards/RelatedByEvent";
import { TagSuggestionsBanner } from "@/components/tags/TagSuggestionsBanner";
import {
  getCardForUser,
  getCardsBySharedEvent,
  listCardsForUser,
  listContactEventsForUser,
} from "@/db/cards";
import type { CardCreateInput } from "@/db/schema";
import { isCoachConfigured } from "@/lib/coach/llm";
import { companySlug, pickCanonicalCompany } from "@/lib/companies/group";
import { computeTemperature } from "@/lib/cards/relationship-temp";
import { findAnniversariesToday } from "@/lib/timeline/anniversaries";
import { readSession } from "@/lib/firebase/session";

import styles from "./detail.module.css";

interface DetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: DetailPageProps) {
  const { id } = await params;
  const user = await readSession();
  if (!user) return { title: "名片" };
  const card = await getCardForUser(user.uid, id);
  if (!card) return { title: "找不到名片" };
  return {
    title: card.nameZh || card.nameEn || "名片",
  };
}

export default async function CardDetailPage({ params, searchParams }: DetailPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const showSuggest = sp["suggest"] === "1";
  const user = await readSession();
  if (!user) return null;
  const card = await getCardForUser(user.uid, id);
  if (!card || card.deletedAt) notFound();
  const contactEvents = await listContactEventsForUser(id, user.uid, 30);
  // Wrap in try/catch so a missing/CREATING composite index doesn't 500
  // the whole detail page; the related sidebar simply doesn't render.
  let sharedEventCards: Awaited<ReturnType<typeof getCardsBySharedEvent>> = [];
  if (card.firstMetEventTag) {
    try {
      sharedEventCards = await getCardsBySharedEvent(user.uid, card.firstMetEventTag, card.id, 8);
    } catch (err) {
      console.error("[card detail] related-by-event failed:", err);
    }
  }

  const primary = card.nameZh || card.nameEn || "（未命名）";
  // The header now renders nameEn / role / company through CardInlineEdit
  // directly from card.* — no need for derived display strings.

  // Anniversary chip — surfaces "認識 N 週年" only when today is the
  // anniversary of firstMetDate. Reuses the same pure fn the timeline
  // section uses, so the chip and the home-screen surface are always
  // consistent.
  const anniversaryEntry = findAnniversariesToday([card], new Date()).find(
    (e) => e.card.id === card.id,
  );
  const anniversaryYears = anniversaryEntry?.years ?? null;

  // Count siblings at the same company so we can offer a link to the
  // /companies/[slug] hub. Wrapped in try/catch — a flaky list query
  // should not 500 the whole detail page; the link just won't render.
  let companySiblingCount = 0;
  let companyHrefSlug: string | null = null;
  const canonicalCompany = pickCanonicalCompany(card);
  if (canonicalCompany) {
    try {
      const all = await listCardsForUser(user.uid, { limit: 500 });
      const wantedKey = canonicalCompany.toLowerCase().trim();
      companySiblingCount = all.filter((c) => {
        if (c.id === card.id || c.deletedAt) return false;
        const co = pickCanonicalCompany(c).toLowerCase().trim();
        return co === wantedKey;
      }).length;
      if (companySiblingCount > 0) companyHrefSlug = companySlug(canonicalCompany);
    } catch (err) {
      console.error("[card detail] company-sibling count failed:", err);
    }
  }
  const primaryPhone = card.phones.find((p) => p.primary) ?? card.phones[0];
  const primaryEmail = card.emails.find((e) => e.primary) ?? card.emails[0];

  // Build a CardCreateInput-shaped draft from the stored card for the suggestion panel.
  // CardSummary is a projection of CardDoc — some fields (addresses, companyWebsite,
  // ocrProvider, etc.) are not included. Omit them; the suggestion layer tolerates
  // missing optional fields gracefully.
  const cardDraft: CardCreateInput = {
    nameZh: card.nameZh,
    nameEn: card.nameEn,
    namePhonetic: card.namePhonetic,
    jobTitleZh: card.jobTitleZh,
    jobTitleEn: card.jobTitleEn,
    department: card.department,
    companyZh: card.companyZh,
    companyEn: card.companyEn,
    phones: card.phones,
    emails: card.emails,
    addresses: [],
    social: card.social ?? {},
    whyRemember: card.whyRemember,
    firstMetDate: card.firstMetDate,
    firstMetContext: card.firstMetContext,
    firstMetEventTag: card.firstMetEventTag,
    notes: card.notes,
    tagIds: card.tagIds,
    tagNames: card.tagNames,
    frontImagePath: card.frontImagePath,
    backImagePath: card.backImagePath,
  };

  return (
    <article className={styles.article}>
      <nav aria-label="Breadcrumbs" className={styles.crumbs}>
        <Link href="/cards">名片冊</Link>
        <span aria-hidden="true"> · </span>
        <span>{primary}</span>
      </nav>

      {showSuggest && (
        <TagSuggestionsBanner
          cardId={card.id}
          cardDraft={cardDraft}
          currentTagIds={card.tagIds}
          currentTagNames={card.tagNames}
        />
      )}

      <div className={styles.layout}>
        <main className={styles.main}>
          <header className={styles.header}>
            <div className={styles.kickerRow}>
              <p className={styles.kicker}>名片</p>
              <TemperatureBadge temperature={computeTemperature(card, new Date())} />
            </div>
            <h1 className={styles.name}>
              <CardInlineEdit
                cardId={card.id}
                field="nameZh"
                value={card.nameZh}
                placeholder="（中文姓名）"
                ariaLabel="中文姓名"
                maxLength={100}
              />
            </h1>
            <p className={styles.nameEn}>
              <CardInlineEdit
                cardId={card.id}
                field="nameEn"
                value={card.nameEn}
                placeholder="（English name）"
                ariaLabel="英文姓名"
                maxLength={100}
              />
            </p>
            <p className={styles.subtitle}>
              <CardInlineEdit
                cardId={card.id}
                field="jobTitleZh"
                value={card.jobTitleZh}
                placeholder="（職稱）"
                ariaLabel="職稱（中文）"
                maxLength={100}
              />
              <em className={styles.sep}>於</em>
              <CardInlineEdit
                cardId={card.id}
                field="companyZh"
                value={card.companyZh}
                placeholder="（公司）"
                ariaLabel="公司（中文）"
                maxLength={100}
              />
            </p>
            {anniversaryYears !== null && (
              <p className={styles.anniversary} role="status">
                🎉 {anniversaryYears} 年前的今天認識
              </p>
            )}
          </header>

          <section className={styles.why}>
            <p className={styles.whyLabel}>為什麼記得這個人</p>
            <blockquote className={styles.whyBody}>
              <CardInlineEdit
                cardId={card.id}
                field="whyRemember"
                value={card.whyRemember}
                placeholder="（寫一句話：為什麼記得這個人）"
                ariaLabel="為什麼記得這個人"
                multiline
                maxLength={500}
              />
            </blockquote>
          </section>

          {isCoachConfigured() && <CoachInsightSection cardId={card.id} isPinned={card.isPinned} />}

          {(card.firstMetContext || card.firstMetDate || card.firstMetEventTag) && (
            <section className={styles.context}>
              <h2 className={styles.sectionTitle}>第一次見面</h2>
              <dl className={styles.contextList}>
                {card.firstMetDate && (
                  <div>
                    <dt>日期</dt>
                    <dd>{card.firstMetDate}</dd>
                  </div>
                )}
                {card.firstMetEventTag && (
                  <div>
                    <dt>場合</dt>
                    <dd>{card.firstMetEventTag}</dd>
                  </div>
                )}
                {card.firstMetContext && (
                  <div>
                    <dt>情境</dt>
                    <dd>{card.firstMetContext}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {card.notes && (
            <section className={styles.notes}>
              <h2 className={styles.sectionTitle}>備註</h2>
              <p className={styles.notesBody}>{card.notes}</p>
            </section>
          )}

          {isCoachConfigured() && (
            <CardChatBox cardId={card.id} displayName={card.nameZh || card.nameEn} />
          )}

          <ContactEventList events={contactEvents} />
        </main>

        <aside className={styles.sidebar} aria-label="Contact details">
          <section className={styles.contactBlock}>
            <h2 className={styles.sidebarTitle}>聯絡</h2>
            <ul className={styles.contactList}>
              {card.phones.map((phone, index) => (
                <li key={`phone-${index}`}>
                  <span className={styles.contactLabel}>{phone.label}</span>
                  <a href={`tel:${phone.value}`} className={styles.contactValue}>
                    {phone.value}
                  </a>
                </li>
              ))}
              {card.emails.map((email, index) => (
                <li key={`email-${index}`}>
                  <span className={styles.contactLabel}>{email.label}</span>
                  <a href={`mailto:${email.value}`} className={styles.contactValue}>
                    {email.value}
                  </a>
                </li>
              ))}
              {card.social?.linkedinUrl && (
                <li>
                  <span className={styles.contactLabel}>linkedin</span>
                  <a
                    href={card.social.linkedinUrl}
                    className={styles.contactValue}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    打開連結
                  </a>
                </li>
              )}
              {card.social?.lineId && (
                <li>
                  <span className={styles.contactLabel}>line</span>
                  <span className={styles.contactValue}>{card.social.lineId}</span>
                </li>
              )}
              {card.social?.wechatId && (
                <li>
                  <span className={styles.contactLabel}>wechat</span>
                  <span className={styles.contactValue}>{card.social.wechatId}</span>
                </li>
              )}
            </ul>
          </section>

          <CardActions
            cardId={card.id}
            displayName={primary}
            phones={card.phones?.map((p) => ({ label: p.label, value: p.value }))}
            emails={card.emails?.map((e) => ({ label: e.label, value: e.value }))}
            lineId={card.social?.lineId}
            linkedinUrl={card.social?.linkedinUrl}
            isPinned={card.isPinned}
            followUpAt={card.followUpAt ? card.followUpAt.toISOString().slice(0, 10) : null}
          />

          <PublicProfileToggle
            cardId={card.id}
            currentSlug={card.publicSlug ?? null}
            defaultSlugSuggestion={(card.nameEn || card.nameZh || "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 30)}
          />

          {card.firstMetEventTag && sharedEventCards.length > 0 && (
            <RelatedByEvent eventTag={card.firstMetEventTag} cards={sharedEventCards} />
          )}

          {companyHrefSlug && companySiblingCount > 0 && (
            <section className={styles.relatedCompany} aria-label="同公司聯絡人">
              <Link
                href={`/companies/${encodeURIComponent(companyHrefSlug)}`}
                className={styles.relatedCompanyLink}
              >
                同公司還有 {companySiblingCount} 位 →
              </Link>
            </section>
          )}

          <footer className={styles.timestamps}>
            {card.createdAt && (
              <p>
                <span>建立於</span>
                <time dateTime={card.createdAt.toISOString()}>
                  {card.createdAt.toLocaleDateString("zh-Hant")}
                </time>
              </p>
            )}
            {card.lastContactedAt && (
              <p>
                <span>上次互動</span>
                <time dateTime={card.lastContactedAt.toISOString()}>
                  {card.lastContactedAt.toLocaleDateString("zh-Hant")}
                </time>
              </p>
            )}
          </footer>
        </aside>
      </div>
    </article>
  );
}
