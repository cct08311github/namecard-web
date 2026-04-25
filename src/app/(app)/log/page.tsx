import Link from "next/link";

import { ConversationLog } from "@/components/conversations/ConversationLog";
import { isCoachConfigured } from "@/lib/coach/llm";

import styles from "./log.module.css";

export const metadata = {
  title: "對話速記",
};

export default function LogPage() {
  const llmReady = isCoachConfigured();
  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>🗣️ 對話速記</p>
        <h1 className={styles.title}>
          剛聊完？<em>講一句</em>就 log 進對方的卡
        </h1>
        <p className={styles.lead}>
          不用滑名片冊找人、不用點開卡片填表 ——「今天跟陳玉涵聊到他公司在募 A 輪、看 SaaS 估值」。AI
          自動找到對方的卡、把對話內容記下來、更新最後聯絡時間。下次見面前看一眼就知道上次談到哪。
        </p>
      </header>

      {!llmReady ? (
        <section className={styles.notReady}>
          <p>
            AI 目前未啟用 — 管理員尚未設定 LLM 金鑰。請改在卡片內手動點「記錄互動」
            <Link href="/cards"> 回名片冊</Link>。
          </p>
        </section>
      ) : (
        <ConversationLog />
      )}
    </article>
  );
}
