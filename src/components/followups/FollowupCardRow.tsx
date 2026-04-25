"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { logContactAction } from "@/app/(app)/cards/actions";
import { ReengageDraftsButton } from "@/components/coach/ReengageDraftsButton";
import type { CardSummary } from "@/db/cards";

import styles from "./FollowupCardRow.module.css";

interface FollowupCardRowProps {
  card: CardSummary;
  days: number;
  /** When false, hides the ✨ AI 草稿 disclosure (e.g. server didn't config LLM). */
  showAiDrafts?: boolean;
}

/**
 * One row of the follow-up list: card summary + inline "I contacted
 * this person just now" button. Skips the note capture step on
 * purpose — triage flow should be fast; typing a note is an extra
 * click the user can do from the detail page when they want to.
 */
export function FollowupCardRow({ card, days, showAiDrafts = false }: FollowupCardRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const primary = card.nameZh || card.nameEn || "（未命名）";
  const secondary = [card.jobTitleZh || card.jobTitleEn, card.companyZh || card.companyEn]
    .filter(Boolean)
    .join(" · ");
  const primaryEmail = card.emails?.find((e) => e.primary)?.value ?? card.emails?.[0]?.value;
  const primaryPhone = card.phones?.find((p) => p.primary)?.value ?? card.phones?.[0]?.value;
  const lineId = card.social?.lineId;

  function handleMark() {
    startTransition(async () => {
      const result = await logContactAction({ id: card.id, note: "" });
      if (result?.serverError) return;
      setDone(true);
      // Give the user a moment to register the "done" state, then refresh
      // the list so this row drops out of the bucket.
      setTimeout(() => router.refresh(), 600);
    });
  }

  return (
    <li className={styles.row}>
      <div className={styles.headerRow}>
        <Link href={`/cards/${card.id}`} className={styles.link}>
          <div className={styles.primary}>
            {card.isPinned && <span className={styles.pin}>📍</span>}
            <span className={styles.name}>{primary}</span>
            {secondary && <span className={styles.secondary}>{secondary}</span>}
          </div>
          <span className={styles.days}>{days} 天</span>
        </Link>
        <button
          type="button"
          className={styles.markBtn}
          onClick={handleMark}
          disabled={pending || done}
          aria-label={`標記已聯絡 ${primary}`}
        >
          {done ? "✓ 完成" : pending ? "記錄中…" : "✅ 已聯絡"}
        </button>
      </div>
      {showAiDrafts && (
        <ReengageDraftsButton
          cardId={card.id}
          primaryEmail={primaryEmail}
          primaryPhone={primaryPhone}
          lineId={lineId}
        />
      )}
    </li>
  );
}
