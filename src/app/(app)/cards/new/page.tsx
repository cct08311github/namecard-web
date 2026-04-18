import { CardForm } from "@/components/cards/CardForm";
import styles from "./new.module.css";

export const metadata = {
  title: "新增名片",
};

export default function NewCardPage() {
  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>新增</p>
        <h1 className={styles.title}>
          為一位<em>值得記得</em>的人建檔
        </h1>
        <p className={styles.lead}>
          「為什麼記得這個人」是必填欄位—— 寫下當下的情境與判斷，未來的你會感謝現在的你。
        </p>
      </header>
      <CardForm mode="create" />
    </article>
  );
}
