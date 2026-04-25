import Link from "next/link";

import { IntroSuggestionsList } from "@/components/coach/IntroSuggestionsList";
import { isCoachConfigured } from "@/lib/coach/llm";

import styles from "./intros.module.css";

export const metadata = {
  title: "AI 介紹建議",
};

export default function IntrosPage() {
  const llmReady = isCoachConfigured();

  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>🤝 AI 介紹建議</p>
        <h1 className={styles.title}>
          你名片冊裡，<em>誰跟誰</em>應該認識？
        </h1>
        <p className={styles.lead}>
          商務人士最有價值的不是「自己認識誰」，是「能介紹誰跟誰」。AI 掃過你的名片冊，找出 3-5
          對應該認識的人 + 為什麼 + 寫好的 intro email。把你從 contact owner 升級成
          super-connector。
        </p>
      </header>

      {!llmReady ? (
        <section className={styles.notReady}>
          <p>AI 目前未啟用 — 管理員尚未設定 LLM 金鑰。</p>
        </section>
      ) : (
        <IntroSuggestionsList />
      )}

      <footer className={styles.footer}>
        <Link href="/cards" className={styles.backLink}>
          ← 回名片冊
        </Link>
      </footer>
    </article>
  );
}
