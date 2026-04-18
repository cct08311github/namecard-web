import { redirect } from "next/navigation";

import { listTagsForUser } from "@/db/tags";
import { readSession } from "@/lib/firebase/session";

import { TagsClient } from "./TagsClient";
import styles from "./tags.module.css";

export const metadata = { title: "標籤管理" };

export default async function TagsPage() {
  const user = await readSession();
  if (!user) redirect("/login");
  const tags = await listTagsForUser(user.uid);

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h1 className={styles.title}>標籤</h1>
        <p className={styles.lede}>
          標籤幫你把名片照「活動、產業、合作關係」分類。
          <strong>重新命名會自動同步所有用到這個標籤的名片。</strong>
        </p>
      </header>
      <TagsClient tags={tags} />
    </section>
  );
}
