"use client";

import { useState, useTransition } from "react";

import { askCardQuestionAction } from "@/app/(app)/cards/actions";

import styles from "./CardChatBox.module.css";

interface CardChatBoxProps {
  cardId: string;
  /** Display name for the placeholder hint, e.g. "陳玉涵". */
  displayName?: string;
}

interface QAPair {
  q: string;
  a: string | null;
  err?: string;
}

const SUGGESTED_QUESTIONS = [
  "上次他提到什麼重要的事？",
  "他公司在做什麼？",
  "下次見面該帶什麼話題？",
  "我跟他關係深嗎？",
];

const MAX_HISTORY = 3;

/**
 * 💬 Free-form Q&A about this card. Single-shot per question — we
 * don't carry conversation history into the LLM (each call sends only
 * card + events as context). UI keeps the last 3 Q&A pairs visible so
 * the user can scan; older ones scroll out of mind.
 */
export function CardChatBox({ cardId, displayName }: CardChatBoxProps) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QAPair[]>([]);
  const [pending, startTransition] = useTransition();

  const ask = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) return;
    const pair: QAPair = { q: trimmed, a: null };
    setHistory((prev) => [pair, ...prev].slice(0, MAX_HISTORY));
    setQuestion("");
    startTransition(async () => {
      const res = await askCardQuestionAction({ cardId, question: trimmed });
      setHistory((prev) =>
        prev.map((p) => {
          if (p !== pair) return p;
          if (!res?.data) return { ...p, err: "送出失敗（網路）" };
          if (!res.data.ok) {
            const msg =
              res.data.reason === "no-llm"
                ? "AI 未啟用"
                : res.data.reason === "card-not-found"
                  ? "找不到卡片"
                  : "AI 解析失敗，請換個問法";
            return { ...p, err: msg };
          }
          return { ...p, a: res.data.answer };
        }),
      );
    });
  };

  const placeholder = displayName ? `問問關於 ${displayName} 的任何事…` : "問問關於這個人的任何事…";

  return (
    <section className={styles.section} aria-label="問問 AI 這個人">
      <h2 className={styles.title}>💬 問問 AI 這個人</h2>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <textarea
          className={styles.input}
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 500))}
          rows={2}
          placeholder={placeholder}
          maxLength={500}
          disabled={pending}
        />
        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.askBtn}
            disabled={pending || question.trim().length < 2}
          >
            {pending ? "AI 思考中…" : "問"}
          </button>
        </div>
      </form>

      {history.length === 0 && (
        <div className={styles.suggested}>
          <p className={styles.suggestedLabel}>試試問：</p>
          <ul className={styles.suggestedList}>
            {SUGGESTED_QUESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className={styles.suggestedBtn}
                  onClick={() => ask(s)}
                  disabled={pending}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <ol className={styles.history}>
          {history.map((p, i) => (
            <li key={`${i}-${p.q}`} className={styles.qa}>
              <p className={styles.q}>Q：{p.q}</p>
              {p.err ? (
                <p className={styles.err}>{p.err}</p>
              ) : p.a === null ? (
                <p className={styles.thinking}>思考中…</p>
              ) : (
                <p className={styles.a}>{p.a}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
