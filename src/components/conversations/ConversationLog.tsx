"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { extractConversationAction, logConversationAction } from "@/app/(app)/log/actions";
import { VoiceMicButton } from "@/components/cards/VoiceMicButton";
import type { CardSummary } from "@/db/cards";
import { encodePrefill } from "@/lib/voice/extract";

import styles from "./ConversationLog.module.css";

const EXAMPLES = [
  "今天跟陳玉涵聊到他公司在募 A 輪、看 SaaS 估值",
  "中午跟 Karen Chen 對 demo day pitch deck，她建議拿掉第 5 頁的 TAM 圖表",
  "上午跟王小明電話，確認下週合約走 OEM 而不是 reseller",
];

type Phase =
  | { kind: "input" }
  | { kind: "loading" }
  | {
      kind: "matched";
      personName: string;
      summary: string;
      candidates: CardSummary[];
      pickedCardId: string | null;
    }
  | { kind: "noMatch"; personName: string; summary: string }
  | { kind: "creating" }
  | { kind: "done"; cardId: string }
  | { kind: "error"; message: string };

/**
 * 對話速記 — voice/text → AI extracts {person, summary} → fuzzy match
 * → log contact event in one step. Phase machine kept colocated to
 * avoid premature abstraction; each phase is a discrete render branch.
 */
export function ConversationLog() {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 3) return;
    setPhase({ kind: "loading" });
    startTransition(async () => {
      const res = await extractConversationAction({ text: trimmed });
      if (!res?.data) {
        setPhase({ kind: "error", message: "AI 沒回應，請稍後再試或檢查網路。" });
        return;
      }
      if (!res.data.ok) {
        setPhase({
          kind: "error",
          message:
            res.data.reason === "no-llm"
              ? "AI 未啟用 — 管理員尚未設定 LLM 金鑰。"
              : "AI 解析失敗，請換句話重試。",
        });
        return;
      }
      const { personName, summary, candidates } = res.data;
      if (candidates.length === 0) {
        setPhase({ kind: "noMatch", personName, summary });
      } else {
        setPhase({
          kind: "matched",
          personName,
          summary,
          candidates,
          pickedCardId: candidates[0]!.id,
        });
      }
    });
  };

  const reset = () => {
    setText("");
    setInterim("");
    setPhase({ kind: "input" });
  };

  const confirmLog = (cardId: string, summary: string) => {
    setPhase({ kind: "creating" });
    startTransition(async () => {
      const res = await logConversationAction({ cardId, summary });
      if (!res?.data) {
        setPhase({ kind: "error", message: "送出失敗（網路）" });
        return;
      }
      if (!res.data.ok) {
        setPhase({ kind: "error", message: res.data.reason });
        return;
      }
      setPhase({ kind: "done", cardId });
    });
  };

  const handleExample = (example: string) => {
    setText(example);
    setPhase({ kind: "input" });
  };

  if (phase.kind === "input" || phase.kind === "loading") {
    const loading = phase.kind === "loading" || pending;
    return (
      <section className={styles.section}>
        <label htmlFor="log-text" className={styles.label}>
          講一句剛剛聊了什麼
        </label>
        <textarea
          id="log-text"
          className={styles.textarea}
          value={text + (interim ? `（${interim}）` : "")}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="例：今天跟陳玉涵聊到他公司在募 A 輪、看 SaaS 估值"
          disabled={loading}
        />
        <VoiceMicButton
          onFinalTranscript={(t) => setText((prev) => (prev ? `${prev}${t}` : t))}
          onInterimTranscript={setInterim}
          disabled={loading}
        />
        {interim && <p className={styles.interim}>聆聽中：「{interim}」</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={submit}
            disabled={loading || text.trim().length < 3}
          >
            {loading ? "AI 解析中…" : "🪄 解析並記錄"}
          </button>
        </div>
        <details className={styles.examples}>
          <summary>看範例</summary>
          <ul className={styles.exampleList}>
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  className={styles.exampleBtn}
                  onClick={() => handleExample(ex)}
                  disabled={loading}
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </details>
      </section>
    );
  }

  if (phase.kind === "matched") {
    const picked =
      phase.candidates.find((c) => c.id === phase.pickedCardId) ?? phase.candidates[0]!;
    return (
      <section className={styles.preview}>
        <h2 className={styles.previewTitle}>
          找到 {phase.candidates.length} 位「{phase.personName}」
        </h2>

        {phase.candidates.length > 1 && (
          <ul className={styles.candidateList}>
            {phase.candidates.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className={card.id === picked.id ? styles.candidatePicked : styles.candidate}
                  onClick={() =>
                    setPhase({
                      ...phase,
                      pickedCardId: card.id,
                    })
                  }
                  aria-pressed={card.id === picked.id}
                >
                  <span className={styles.candidateName}>
                    {card.nameZh ?? card.nameEn ?? "（未命名）"}
                  </span>
                  {(card.companyZh || card.companyEn || card.jobTitleZh || card.jobTitleEn) && (
                    <span className={styles.candidateMeta}>
                      {[card.jobTitleZh ?? card.jobTitleEn, card.companyZh ?? card.companyEn]
                        .filter(Boolean)
                        .join(" @ ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.summaryBox}>
          <p className={styles.fieldLabel}>對話內容</p>
          <textarea
            className={styles.summaryTextarea}
            value={phase.summary}
            onChange={(e) => setPhase({ ...phase, summary: e.target.value })}
            rows={3}
            maxLength={500}
          />
        </div>

        <div className={styles.previewActions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => confirmLog(picked.id, phase.summary)}
            disabled={pending || !phase.summary.trim()}
          >
            ✅ 記錄到「{picked.nameZh ?? picked.nameEn}」
          </button>
          <button type="button" className={styles.smallBtn} onClick={reset} disabled={pending}>
            重來
          </button>
        </div>
      </section>
    );
  }

  if (phase.kind === "noMatch") {
    const goCreateNew = () => {
      const prefill = encodePrefill({
        nameZh: phase.personName,
        whyRemember: phase.summary,
      });
      router.push(`/cards/new?prefill=${prefill}`);
    };
    return (
      <section className={styles.preview}>
        <h2 className={styles.previewTitle}>名片冊裡找不到「{phase.personName}」</h2>
        <p className={styles.fieldLabel}>對話內容</p>
        <p className={styles.summaryRead}>{phase.summary}</p>
        <div className={styles.previewActions}>
          <button type="button" className={styles.primaryBtn} onClick={goCreateNew}>
            ➕ 建立新卡（已預填名字 + 內容）
          </button>
          <button type="button" className={styles.smallBtn} onClick={reset}>
            改名稱重試
          </button>
        </div>
      </section>
    );
  }

  if (phase.kind === "creating") {
    return (
      <section className={styles.preview}>
        <p>記錄中…</p>
      </section>
    );
  }

  if (phase.kind === "done") {
    return (
      <section className={styles.preview}>
        <h2 className={styles.previewTitle}>已記錄 ✅</h2>
        <div className={styles.previewActions}>
          <Link href={`/cards/${phase.cardId}`} className={styles.primaryBtn}>
            看卡片詳細
          </Link>
          <button type="button" className={styles.smallBtn} onClick={reset}>
            再記下一次
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <p className={styles.error}>{phase.message}</p>
      <button type="button" className={styles.smallBtn} onClick={reset}>
        重試
      </button>
    </section>
  );
}
