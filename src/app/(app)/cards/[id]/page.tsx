import Link from "next/link";
import { notFound } from "next/navigation";

import { CardActions } from "@/components/cards/CardActions";
import { getCardForUser } from "@/db/cards";
import { readSession } from "@/lib/firebase/session";

import styles from "./detail.module.css";

interface DetailPageProps {
  params: Promise<{ id: string }>;
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

export default async function CardDetailPage({ params }: DetailPageProps) {
  const { id } = await params;
  const user = await readSession();
  if (!user) return null;
  const card = await getCardForUser(user.uid, id);
  if (!card || card.deletedAt) notFound();

  const primary = card.nameZh || card.nameEn || "（未命名）";
  const secondary = card.nameZh && card.nameEn ? card.nameEn : null;
  const role = card.jobTitleZh || card.jobTitleEn;
  const company = card.companyZh || card.companyEn;
  const primaryPhone = card.phones.find((p) => p.primary) ?? card.phones[0];
  const primaryEmail = card.emails.find((e) => e.primary) ?? card.emails[0];

  return (
    <article className={styles.article}>
      <nav aria-label="Breadcrumbs" className={styles.crumbs}>
        <Link href="/cards">名片冊</Link>
        <span aria-hidden="true"> · </span>
        <span>{primary}</span>
      </nav>

      <div className={styles.layout}>
        <main className={styles.main}>
          <header className={styles.header}>
            <p className={styles.kicker}>名片</p>
            <h1 className={styles.name}>{primary}</h1>
            {secondary && <p className={styles.nameEn}>{secondary}</p>}
            {(role || company) && (
              <p className={styles.subtitle}>
                {role && <span>{role}</span>}
                {role && company && <em className={styles.sep}>於</em>}
                {company && <strong>{company}</strong>}
              </p>
            )}
          </header>

          {card.whyRemember && (
            <section className={styles.why}>
              <p className={styles.whyLabel}>為什麼記得這個人</p>
              <blockquote className={styles.whyBody}>{card.whyRemember}</blockquote>
            </section>
          )}

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
            primaryPhone={primaryPhone?.value}
            primaryEmail={primaryEmail?.value}
          />

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
