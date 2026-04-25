import { CardForm } from "@/components/cards/CardForm";
import type { CardCreateInput } from "@/db/schema";
import { decodePrefill } from "@/lib/voice/extract";

import styles from "./new.module.css";

export const metadata = {
  title: "新增名片",
};

interface NewCardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewCardPage({ searchParams }: NewCardPageProps) {
  const sp = await searchParams;
  const prefillRaw = typeof sp.prefill === "string" ? sp.prefill : null;
  const prefill = prefillRaw ? decodePrefill(prefillRaw) : null;
  const defaults: Partial<CardCreateInput> | undefined = prefill ?? undefined;

  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>新增</p>
        <h1 className={styles.title}>
          為一位<em>值得記得</em>的人建檔
        </h1>
        <p className={styles.lead}>
          {prefill ? (
            <>已用 AI 解析預填欄位，請檢查 / 補充後送出。</>
          ) : (
            <>「為什麼記得這個人」是必填欄位—— 寫下當下的情境與判斷，未來的你會感謝現在的你。</>
          )}
        </p>
      </header>
      <CardForm mode="create" defaults={defaults} />
    </article>
  );
}
