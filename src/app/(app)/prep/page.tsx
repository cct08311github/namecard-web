import { PrepBoard } from "@/components/prep/PrepBoard";

import styles from "./prep.module.css";

export const metadata = {
  title: "會議準備",
};

interface PrepPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PrepPage({ searchParams }: PrepPageProps) {
  const raw = await searchParams;
  const attendeesParam = raw.attendees;
  const initialText =
    typeof attendeesParam === "string"
      ? attendeesParam.slice(0, 2000)
      : Array.isArray(attendeesParam)
        ? attendeesParam.join(", ").slice(0, 2000)
        : "";

  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>📅 會議準備</p>
        <h1 className={styles.title}>
          等等要見<em>誰</em>？貼上來，看 <em>10 秒</em>就上場
        </h1>
        <p className={styles.lead}>
          貼上行事曆出席者、訊息、或就打名字 ——「明天 3pm 跟 Karen Chen, Tom Lee from
          GreenLeaf」。系統自動找到對方的卡 + 上次聊到的內容 + 關係溫度。一頁完成 prep。
        </p>
      </header>

      <PrepBoard initialText={initialText} />
    </article>
  );
}
