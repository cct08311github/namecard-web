import Link from "next/link";

import { VoiceCardCapture } from "@/components/cards/VoiceCardCapture";
import { isCoachConfigured } from "@/lib/coach/llm";

import styles from "./voice.module.css";

export const metadata = {
  title: "語音建卡",
};

export default function VoiceCardPage() {
  const llmReady = isCoachConfigured();
  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>🎙️ 語音建卡</p>
        <h1 className={styles.title}>
          剛 networking 結束？<em>講 30 秒</em>讓 AI 幫你建檔
        </h1>
        <p className={styles.lead}>
          不用手動填欄位 — 把剛剛遇到的人講出來：「陳玉涵 PM 智威科技 在 2024 Computex 攤位上聊邊緣
          AI 推論很投緣」。AI 會解析出姓名、職稱、公司、認識場合、為什麼記得，預填到建立表單，你檢查
          後一鍵送出。
        </p>
      </header>

      {!llmReady ? (
        <section className={styles.notReady}>
          <p>
            AI 目前未啟用 — 管理員尚未設定 LLM 金鑰。請改用 <Link href="/cards/new">手動建立</Link>
            。
          </p>
        </section>
      ) : (
        <VoiceCardCapture />
      )}
    </article>
  );
}
