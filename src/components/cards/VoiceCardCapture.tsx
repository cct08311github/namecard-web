"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { extractCardFromTextAction } from "@/app/(app)/cards/actions";
import type { ExtractedCard } from "@/lib/voice/extract";

import styles from "./VoiceCardCapture.module.css";

const EXAMPLES = [
  "陳玉涵 PM 智威科技 在 2024 Computex 攤位上聊邊緣 AI 推論很投緣，提到他們公司在做 ML 加速器",
  "李大同 沛理科技業務 BD 上週 Web Summit Lisbon 認識，欠他一個 referral 給 NVIDIA 的 contact",
  "王秘書長 國發會 在 AI 高峰會上聊 sovereign AI 政策，他想知道民間如何配合",
];

type Phase =
  | { kind: "input" }
  | { kind: "loading" }
  | { kind: "ready"; extracted: ExtractedCard; prefillToken: string }
  | { kind: "error"; message: string };

/**
 * 「🎙️ 語音建卡」 capture form. Phase 1: typed text. Future Phase 2:
 * Web Speech API live transcript. Submits the text to MiniMax for
 * structured extraction, shows a preview grid, then redirects to
 * /cards/new?prefill=... so the user reviews + commits via the
 * standard create flow (re-uses all existing validation + UI).
 */
export function VoiceCardCapture() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setPhase({ kind: "error", message: "至少描述 3 個字" });
      return;
    }
    setPhase({ kind: "loading" });
    startTransition(async () => {
      const result = await extractCardFromTextAction({ text: trimmed });
      const data = result?.data;
      if (result?.serverError) {
        setPhase({ kind: "error", message: result.serverError });
        return;
      }
      if (!data || !data.ok) {
        const messages: Record<string, string> = {
          "no-llm": "AI 未啟用",
          "llm-failed": "AI 解析失敗，請重試或改用手動建立",
        };
        const reason = data && !data.ok ? data.reason : null;
        setPhase({
          kind: "error",
          message: reason ? (messages[reason] ?? "未知錯誤") : "解析失敗",
        });
        return;
      }
      setPhase({ kind: "ready", extracted: data.extracted, prefillToken: data.prefillToken });
    });
  };

  const applyExample = (s: string) => {
    setText(s);
    setPhase({ kind: "input" });
  };

  const goCreate = () => {
    if (phase.kind !== "ready") return;
    router.push(`/cards/new?prefill=${encodeURIComponent(phase.prefillToken)}`);
  };

  return (
    <section className={styles.section}>
      <label htmlFor="voice-text" className={styles.label}>
        把剛剛遇到的人講出來（暫時用打字，未來會接語音）
      </label>
      <textarea
        id="voice-text"
        className={styles.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="例如：陳玉涵 PM 智威科技 在 Computex 攤位聊邊緣 AI 推論..."
        rows={5}
        maxLength={2000}
        disabled={pending && phase.kind === "loading"}
      />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={submit}
          disabled={pending || text.trim().length < 3}
        >
          {pending && phase.kind === "loading" ? "✨ AI 解析中…" : "✨ 解析 + 預填表單"}
        </button>
        {text && (
          <button type="button" className={styles.smallBtn} onClick={() => setText("")}>
            清空
          </button>
        )}
      </div>

      <details className={styles.examples}>
        <summary>看範例 →</summary>
        <ul className={styles.exampleList}>
          {EXAMPLES.map((ex, i) => (
            <li key={i}>
              <button type="button" className={styles.exampleBtn} onClick={() => applyExample(ex)}>
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </details>

      {phase.kind === "error" && (
        <p role="alert" className={styles.error}>
          {phase.message}
        </p>
      )}

      {phase.kind === "ready" && (
        <div className={styles.preview} aria-live="polite">
          <h2 className={styles.previewTitle}>✨ AI 解析結果</h2>
          <dl className={styles.fieldGrid}>
            <PreviewField label="姓名（中）" value={phase.extracted.nameZh} />
            <PreviewField label="姓名（英）" value={phase.extracted.nameEn} />
            <PreviewField label="職稱（中）" value={phase.extracted.jobTitleZh} />
            <PreviewField label="職稱（英）" value={phase.extracted.jobTitleEn} />
            <PreviewField label="公司（中）" value={phase.extracted.companyZh} />
            <PreviewField label="公司（英）" value={phase.extracted.companyEn} />
            <PreviewField label="部門" value={phase.extracted.department} />
            <PreviewField label="認識場合" value={phase.extracted.firstMetEventTag} />
            <PreviewField label="情境" value={phase.extracted.firstMetContext} />
            <PreviewField
              label="為什麼記得（必填）"
              value={phase.extracted.whyRemember}
              highlight
            />
            <PreviewField label="備註" value={phase.extracted.notes} />
          </dl>
          <div className={styles.previewActions}>
            <button type="button" className={styles.primaryBtn} onClick={goCreate}>
              使用此解析建立 →
            </button>
            <button
              type="button"
              className={styles.smallBtn}
              onClick={() => setPhase({ kind: "input" })}
            >
              重新編輯文字
            </button>
            <button
              type="button"
              className={styles.smallBtn}
              onClick={() => {
                setPhase({ kind: "input" });
                submit();
              }}
            >
              🔄 重新解析
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PreviewField({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | undefined;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? styles.fieldHighlight : styles.field}>
      <dt className={styles.fieldLabel}>{label}</dt>
      <dd className={value ? styles.fieldValue : styles.fieldEmpty}>{value || "—"}</dd>
    </div>
  );
}
