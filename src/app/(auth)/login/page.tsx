import { readSession } from "@/lib/firebase/session";
import { redirect } from "next/navigation";

import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await readSession();
  if (user) redirect("/");
  const { next: rawNext } = await searchParams;
  // P0 open-redirect guard: only allow relative paths that start with "/"
  // but not "//" (which browsers treat as protocol-relative, i.e. external).
  const safeNext =
    typeof rawNext === "string" && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : null;
  return (
    <main className={styles.shell}>
      <article className={styles.article}>
        <p className={styles.kicker}>Namecard Web</p>
        <h1 className={styles.title}>
          登入你的<em>名片冊</em>
        </h1>
        <p className={styles.lead}>
          透過 Google 帳號登入。本系統採白名單制——
          <br />
          只有被允許的 email 能存取。
        </p>
        <LoginForm next={safeNext ?? undefined} />
        <p className={styles.footnote}>未被授權卻該有存取權？請聯絡管理員更新 ALLOWED_EMAILS。</p>
      </article>
    </main>
  );
}
