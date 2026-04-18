import Link from "next/link";

import styles from "../login/login.module.css";

export const metadata = {
  title: "未授權",
};

export default function UnauthorizedPage() {
  return (
    <main className={styles.shell}>
      <article className={styles.article}>
        <p className={styles.kicker}>403 · 未授權</p>
        <h1 className={styles.title}>
          這個帳號<em>不在名單</em>上
        </h1>
        <p className={styles.lead}>
          你的 Google 帳號目前不在 <code>ALLOWED_EMAILS</code> 白名單內。 請聯絡管理員新增後再登入。
        </p>
        <Link href="/login" className={styles.button}>
          返回登入
        </Link>
      </article>
    </main>
  );
}
