"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { findAttendeesAction, type PrepResult } from "@/app/(app)/prep/actions";
import { encodePrefill } from "@/lib/voice/extract";
import { computeTemperature } from "@/lib/cards/relationship-temp";

import { TemperatureBadge } from "@/components/cards/TemperatureBadge";
import { VoiceMicButton } from "@/components/cards/VoiceMicButton";

import styles from "./PrepBoard.module.css";

const EXAMPLES = [
  "明天 3pm 跟 Karen Chen, Tom Lee from GreenLeaf",
  "下午 跟 陳玉涵、王小明 喝咖啡",
  "tomorrow 4pm: Alice, Bob, Charlie",
];

type Phase =
  | { kind: "input" }
  | { kind: "loading" }
  | { kind: "results"; results: PrepResult[] }
  | { kind: "error"; message: string };

function pickName(card: { nameZh?: string; nameEn?: string }): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function pickRoleCompany(card: {
  jobTitleZh?: string;
  jobTitleEn?: string;
  companyZh?: string;
  companyEn?: string;
}): string {
  const role = card.jobTitleZh || card.jobTitleEn;
  const company = card.companyZh || card.companyEn;
  return [role, company].filter(Boolean).join(" @ ");
}

export function PrepBoard() {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [pending, startTransition] = useTransition();
  const now = new Date();

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 2) return;
    setPhase({ kind: "loading" });
    startTransition(async () => {
      const res = await findAttendeesAction({ text: trimmed });
      if (!res?.data) {
        setPhase({ kind: "error", message: "送出失敗（網路）" });
        return;
      }
      setPhase({ kind: "results", results: res.data.results });
    });
  };

  const reset = () => {
    setPhase({ kind: "input" });
  };

  if (phase.kind === "input" || phase.kind === "loading") {
    const loading = phase.kind === "loading" || pending;
    return (
      <section className={styles.section}>
        <label htmlFor="prep-text" className={styles.label}>
          貼上會議資訊或出席者名字
        </label>
        <textarea
          id="prep-text"
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="例：明天 3pm 跟 Karen Chen, Tom Lee 開會"
          disabled={loading}
        />
        <VoiceMicButton
          onFinalTranscript={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))}
          disabled={loading}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={submit}
            disabled={loading || text.trim().length < 2}
          >
            {loading ? "找人中…" : "🔎 找人"}
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
                  onClick={() => {
                    setText(ex);
                    setPhase({ kind: "input" });
                  }}
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

  if (phase.kind === "error") {
    return (
      <section className={styles.section}>
        <p className={styles.error}>{phase.message}</p>
        <button type="button" className={styles.smallBtn} onClick={reset}>
          重試
        </button>
      </section>
    );
  }

  // results
  if (phase.results.length === 0) {
    return (
      <section className={styles.section}>
        <p className={styles.error}>沒抓到任何名字。試試「Karen Chen, Tom Lee」這種寫法。</p>
        <button type="button" className={styles.smallBtn} onClick={reset}>
          回到輸入
        </button>
      </section>
    );
  }

  return (
    <div className={styles.boardWrap}>
      <div className={styles.boardActions}>
        <button type="button" className={styles.smallBtn} onClick={reset}>
          ← 換一組
        </button>
        <span className={styles.boardSummary}>找到 {phase.results.length} 位 attendee</span>
      </div>

      <ol className={styles.attendeeList}>
        {phase.results.map((result, i) => (
          <li key={`${i}-${result.name}`} className={styles.attendee}>
            <h2 className={styles.attendeeName}>
              {result.name}
              <span className={styles.attendeeCount}>
                {result.candidates.length === 0 ? "找不到名片" : `${result.candidates.length} 張卡`}
              </span>
            </h2>

            {result.candidates.length === 0 ? (
              <Link
                href={`/cards/new?prefill=${encodePrefill({ nameZh: result.name, whyRemember: "（會議準備時新增）" })}`}
                className={styles.createLink}
              >
                ➕ 建立新卡
              </Link>
            ) : (
              <ul className={styles.candidateList}>
                {result.candidates.map((c) => (
                  <li key={c.card.id} className={styles.candidate}>
                    <div className={styles.candidateHeader}>
                      <Link href={`/cards/${c.card.id}`} className={styles.candidateName}>
                        {pickName(c.card)}
                      </Link>
                      <TemperatureBadge temperature={computeTemperature(c.card, now)} compact />
                    </div>
                    {pickRoleCompany(c.card) && (
                      <p className={styles.candidateMeta}>{pickRoleCompany(c.card)}</p>
                    )}
                    {c.card.whyRemember && (
                      <p className={styles.whyRemember}>{c.card.whyRemember}</p>
                    )}
                    {c.lastEventNote && (
                      <div className={styles.lastEvent}>
                        <span className={styles.lastEventLabel}>上次（{c.lastEventDate}）聊到</span>
                        <p className={styles.lastEventNote}>{c.lastEventNote}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
