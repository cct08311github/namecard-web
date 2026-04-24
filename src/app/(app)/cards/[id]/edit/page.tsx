import { notFound } from "next/navigation";

import { CardForm } from "@/components/cards/CardForm";
import { OcrRescanPanel } from "@/components/scan/OcrRescanPanel";
import { getCardForUser } from "@/db/cards";
import { readSession } from "@/lib/firebase/session";

import styles from "./edit.module.css";

interface EditPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "編輯名片",
};

export default async function EditCardPage({ params }: EditPageProps) {
  const { id } = await params;
  const user = await readSession();
  if (!user) return null;
  const card = await getCardForUser(user.uid, id);
  if (!card || card.deletedAt) notFound();

  const defaults = {
    nameZh: card.nameZh,
    nameEn: card.nameEn,
    namePhonetic: undefined,
    jobTitleZh: card.jobTitleZh,
    jobTitleEn: card.jobTitleEn,
    department: undefined,
    companyZh: card.companyZh,
    companyEn: card.companyEn,
    companyWebsite: undefined,
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
      <header className={styles.header}>
        <p className={styles.kicker}>編輯</p>
        <h1 className={styles.title}>
          更新<em>{card.nameZh || card.nameEn || "這張名片"}</em>
        </h1>
      </header>
      <OcrRescanPanel
        cardId={id}
        current={{
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
          social: card.social ?? {},
        }}
      />
      <CardForm mode="edit" cardId={id} defaults={defaults} />
    </article>
  );
}
