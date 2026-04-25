"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createCardsBatchAction, extractMultipleCardsAction } from "@/app/(app)/cards/actions";
import type { CardCreateInput } from "@/db/schema";
import { encodePrefill, type ExtractedCard } from "@/lib/voice/extract";

import styles from "./VoiceCardCapture.module.css";
import { VoiceMicButton } from "./VoiceMicButton";

const EXAMPLES = [
  "陳玉涵 PM 智威科技 在 2024 Computex 攤位上聊邊緣 AI 推論很投緣，提到他們公司在做 ML 加速器",
  "李大同 沛理科技業務 BD 上週 Web Summit Lisbon 認識，欠他一個 referral 給 NVIDIA 的 contact",
  "今天 Demo Day 認識三個人：A 是 GreenLeaf 共同創辦人 Sarah Wang 在做永續供應鏈，B 是 Pixel 的 PM Tom Chen 在開發 AR 眼鏡，C 是創投 Mike 在找早期 hardware 案",
];

type Phase =
  | { kind: "input" }
  | { kind: "loading" }
  | { kind: "ready"; extracted: ExtractedCard[]; excluded: Set<number> }
  | { kind: "creating" }
  | { kind: "created"; ids: string[] }
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
  const [interim, setInterim] = useState("");
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
      const result = await extractMultipleCardsAction({ text: trimmed });
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
      setPhase({ kind: "ready", extracted: data.extracted, excluded: new Set() });
    });
  };

  const applyExample = (s: string) => {
    setText(s);
    setPhase({ kind: "input" });
  };

  const toggleExclude = (i: number) => {
    if (phase.kind !== "ready") return;
    const next = new Set(phase.excluded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setPhase({ ...phase, excluded: next });
  };

  const goCreate = () => {
    if (phase.kind !== "ready") return;
    const selected = phase.extracted.filter((_, i) => !phase.excluded.has(i));
    if (selected.length === 0) return;

    // Single card → use the prefill flow (lets user fine-tune fields).
    if (selected.length === 1) {
      const token = encodePrefill(selected[0]!);
      router.push(`/cards/new?prefill=${encodeURIComponent(token)}`);
      return;
    }

    // Multi-card → batch create directly. The user already reviewed
    // the AI extraction in the preview grid; per-card editing would
    // turn this into a tabbed mega-form (out of scope).
    setPhase({ kind: "creating" });
    startTransition(async () => {
      const payload: CardCreateInput[] = selected.map((c) => ({
        nameZh: c.nameZh,
        nameEn: c.nameEn,
        namePhonetic: c.namePhonetic,
        jobTitleZh: c.jobTitleZh,
        jobTitleEn: c.jobTitleEn,
        department: c.department,
        companyZh: c.companyZh,
        companyEn: c.companyEn,
        companyWebsite: c.companyWebsite,
        phones: c.phones ?? [],
        emails: c.emails ?? [],
        addresses: c.addresses ?? [],
        social: c.social ?? {},
        whyRemember: c.whyRemember || "（剛認識）",
        firstMetDate: c.firstMetDate,
        firstMetContext: c.firstMetContext,
        firstMetEventTag: c.firstMetEventTag,
        notes: c.notes,
        tagIds: c.tagIds ?? [],
        tagNames: c.tagNames ?? [],
        frontImagePath: c.frontImagePath,
        backImagePath: c.backImagePath,
        ocrProvider: c.ocrProvider,
        ocrConfidence: c.ocrConfidence,
        ocrRawJson: c.ocrRawJson,
      }));
      const result = await createCardsBatchAction({ cards: payload });
      const data = result?.data;
      if (result?.serverError) {
        setPhase({ kind: "error", message: result.serverError });
        return;
      }
      if (!data || !data.ok) {
        const reason = data && !data.ok ? data.reason : "建立失敗";
        setPhase({ kind: "error", message: reason });
        return;
      }
      setPhase({ kind: "created", ids: data.ids });
    });
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
      {interim && <p className={styles.interim}>聆聽中：「{interim}」</p>}
      <VoiceMicButton
        onFinalTranscript={(t) => {
          setText((prev) => (prev ? `${prev} ${t}` : t));
          setInterim("");
        }}
        onInterimTranscript={setInterim}
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
          <h2 className={styles.previewTitle}>
            ✨ AI 解析了 {phase.extracted.length} 張卡
            {phase.extracted.length > 1 ? "（可以剔除不要的）" : ""}
          </h2>
          {phase.extracted.map((card, i) => {
            const excluded = phase.excluded.has(i);
            return (
              <div
                key={i}
                className={excluded ? styles.cardItemExcluded : styles.cardItem}
                aria-label={`卡片 ${i + 1}${excluded ? "（已剔除）" : ""}`}
              >
                <div className={styles.cardItemHeader}>
                  <span className={styles.cardItemRank}>#{i + 1}</span>
                  <span className={styles.cardItemName}>
                    {card.nameZh || card.nameEn || "（未命名）"}
                  </span>
                  <button
                    type="button"
                    className={styles.smallBtn}
                    onClick={() => toggleExclude(i)}
                  >
                    {excluded ? "↩ 取消剔除" : "✕ 剔除"}
                  </button>
                </div>
                <dl className={styles.fieldGrid}>
                  <PreviewField label="姓名（中）" value={card.nameZh} />
                  <PreviewField label="姓名（英）" value={card.nameEn} />
                  <PreviewField label="職稱（中）" value={card.jobTitleZh} />
                  <PreviewField label="職稱（英）" value={card.jobTitleEn} />
                  <PreviewField label="公司（中）" value={card.companyZh} />
                  <PreviewField label="公司（英）" value={card.companyEn} />
                  <PreviewField label="部門" value={card.department} />
                  <PreviewField label="認識場合" value={card.firstMetEventTag} />
                  <PreviewField label="情境" value={card.firstMetContext} />
                  <PreviewField label="為什麼記得（必填）" value={card.whyRemember} highlight />
                  <PreviewField label="備註" value={card.notes} />
                </dl>
              </div>
            );
          })}
          <div className={styles.previewActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={goCreate}
              disabled={pending || phase.excluded.size === phase.extracted.length}
            >
              {phase.extracted.length - phase.excluded.size <= 1
                ? "使用此解析建立 →"
                : `✅ 一鍵建立 ${phase.extracted.length - phase.excluded.size} 張`}
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

      {phase.kind === "creating" && (
        <p className={styles.error} role="status">
          ⏳ 建立中…
        </p>
      )}

      {phase.kind === "created" && (
        <div className={styles.preview} aria-live="polite">
          <h2 className={styles.previewTitle}>✅ 已建立 {phase.ids.length} 張卡</h2>
          <div className={styles.previewActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => router.push("/cards")}
            >
              到名片冊看 →
            </button>
            <button
              type="button"
              className={styles.smallBtn}
              onClick={() => {
                setText("");
                setPhase({ kind: "input" });
              }}
            >
              再建立一批
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
