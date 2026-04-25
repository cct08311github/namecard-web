import Link from "next/link";
import { notFound } from "next/navigation";

import { getCardByPublicSlug } from "@/db/cards";

import styles from "./profile.module.css";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const card = await getCardByPublicSlug(decodeURIComponent(slug));
  if (!card) return { title: "找不到名片" };
  const name = card.nameZh || card.nameEn || "名片";
  return { title: `${name} · 數位名片` };
}

function lineUrl(lineId: string): string {
  return `https://line.me/ti/p/${
    lineId.startsWith("@") ? encodeURIComponent(lineId) : `~${encodeURIComponent(lineId)}`
  }`;
}

/**
 * Public profile route — renders a single user's chosen card without
 * any auth gate. Reached at /u/{slug}, the slug is a unique handle the
 * user picked in their card detail page. No login link, no app chrome
 * — this should look like a standalone digital business card.
 */
export default async function PublicProfilePage({ params }: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const card = await getCardByPublicSlug(slug);
  if (!card) notFound();

  const nameZh = card.nameZh ?? "";
  const nameEn = card.nameEn ?? "";
  const role = card.jobTitleZh || card.jobTitleEn;
  const company = card.companyZh || card.companyEn;
  const department = card.department;
  const phones = card.phones ?? [];
  const emails = card.emails ?? [];
  const lineId = card.social?.lineId;
  const linkedinUrl = card.social?.linkedinUrl;
  const wechatId = card.social?.wechatId;
  const websiteUrl = card.social?.websiteUrl;

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <p className={styles.kicker}>數位名片</p>
          {nameZh && <h1 className={styles.name}>{nameZh}</h1>}
          {nameEn && <p className={styles.nameEn}>{nameEn}</p>}
          {(role || company) && (
            <p className={styles.subtitle}>
              {role && <span>{role}</span>}
              {role && (department || company) && <em className={styles.sep}>於</em>}
              {department && <span>{department}</span>}
              {department && company && <em className={styles.sep}>·</em>}
              {company && <strong>{company}</strong>}
            </p>
          )}
        </header>

        {card.whyRemember && (
          <section className={styles.about}>
            <p className={styles.aboutLabel}>關於我</p>
            <blockquote className={styles.aboutBody}>{card.whyRemember}</blockquote>
          </section>
        )}

        <section className={styles.contactBlock}>
          <h2 className={styles.sectionTitle}>聯絡方式</h2>
          <ul className={styles.contactList}>
            {phones.map((phone, i) => (
              <li key={`phone-${i}`}>
                <span className={styles.contactLabel}>📞 {phone.label}</span>
                <a href={`tel:${phone.value}`} className={styles.contactValue}>
                  {phone.value}
                </a>
              </li>
            ))}
            {emails.map((email, i) => (
              <li key={`email-${i}`}>
                <span className={styles.contactLabel}>📧 {email.label}</span>
                <a href={`mailto:${email.value}`} className={styles.contactValue}>
                  {email.value}
                </a>
              </li>
            ))}
            {lineId && (
              <li>
                <span className={styles.contactLabel}>💬 LINE</span>
                <a
                  href={lineUrl(lineId)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={styles.contactValue}
                >
                  {lineId}
                </a>
              </li>
            )}
            {linkedinUrl && (
              <li>
                <span className={styles.contactLabel}>🔗 LinkedIn</span>
                <a
                  href={linkedinUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={styles.contactValue}
                >
                  打開連結
                </a>
              </li>
            )}
            {wechatId && (
              <li>
                <span className={styles.contactLabel}>💚 WeChat</span>
                <span className={styles.contactValue}>{wechatId}</span>
              </li>
            )}
            {websiteUrl && (
              <li>
                <span className={styles.contactLabel}>🌐 網站</span>
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={styles.contactValue}
                >
                  打開連結
                </a>
              </li>
            )}
          </ul>
        </section>

        <a href={`/api/cards/${card.id}/vcard`} className={styles.downloadBtn} download>
          ↓ 下載 vCard 加入通訊錄
        </a>

        <footer className={styles.footer}>
          <Link href="/" className={styles.brandLink}>
            namecard
          </Link>
          <span className={styles.handle}>/u/{slug}</span>
        </footer>
      </div>
    </main>
  );
}
