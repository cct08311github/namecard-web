"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { logContactAction, setFollowUpAction } from "@/app/(app)/cards/actions";
import { ReengageDraftsButton } from "@/components/coach/ReengageDraftsButton";
import { TemperatureBadge } from "@/components/cards/TemperatureBadge";
import type { CardSummary } from "@/db/cards";
import { localYmdAfterDays } from "@/lib/cards/follow-up-date";
import { computeTemperature } from "@/lib/cards/relationship-temp";

import styles from "./FollowupCardRow.module.css";

interface NextOption {
  label: string;
  /** null = clear follow-up ("不用了"). */
  days: number | null;
}

const NEXT_OPTIONS: readonly NextOption[] = [
  { label: "1 週", days: 7 },
  { label: "2 週", days: 14 },
  { label: "1 月", days: 30 },
  { label: "3 月", days: 90 },
  { label: "不用了", days: null },
];

interface FollowupCardRowProps {
  card: CardSummary;
  days: number;
  /**
   * Override for the right-side label (default `${days} 天`).
   * Reminder sections pass a planning-friendly label like
   * "📅 今天" / "📅 明天" / "📅 4/29".
   */
  daysLabel?: string;
  /** When false, hides the ✨ AI 草稿 disclosure (e.g. server didn't config LLM). */
  showAiDrafts?: boolean;
}

/**
 * One row of the follow-up list: card summary + inline "I contacted
 * this person just now" button. Skips the note capture step on
 * purpose — triage flow should be fast; typing a note is an extra
 * click the user can do from the detail page when they want to.
 */
export function FollowupCardRow({
  card,
  days,
  daysLabel,
  showAiDrafts = false,
}: FollowupCardRowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<"idle" | "picking">("idle");

  const primary = card.nameZh || card.nameEn || "（未命名）";
  const secondary = [card.jobTitleZh || card.jobTitleEn, card.companyZh || card.companyEn]
    .filter(Boolean)
    .join(" · ");
  const primaryEmail = card.emails?.find((e) => e.primary)?.value ?? card.emails?.[0]?.value;
  const primaryPhone = card.phones?.find((p) => p.primary)?.value ?? card.phones?.[0]?.value;
  const lineId = card.social?.lineId;
  // LINE deep-link works cross-platform (web → opens LINE app or login).
  const lineUrl = lineId ? `https://line.me/R/ti/p/~${encodeURIComponent(lineId)}` : null;

  function handleMark() {
    startTransition(async () => {
      const result = await logContactAction({ id: card.id, note: "" });
      if (result?.serverError) return;
      // Stay in the row and offer the next-contact picker — this is the
      // moment the user is most likely to commit to a reminder.
      setStage("picking");
    });
  }

  function handlePick(option: NextOption) {
    startTransition(async () => {
      const followUpAt = option.days === null ? "" : localYmdAfterDays(option.days);
      const result = await setFollowUpAction({ id: card.id, followUpAt });
      if (result?.serverError) return;
      router.refresh();
    });
  }

  return (
    <li className={styles.row}>
      <div className={styles.headerRow}>
        <Link href={`/cards/${card.id}`} className={styles.link}>
          <div className={styles.primary}>
            {card.isPinned && <span className={styles.pin}>📍</span>}
            <span className={styles.name}>{primary}</span>
            <TemperatureBadge temperature={computeTemperature(card, new Date())} compact />
            {secondary && <span className={styles.secondary}>{secondary}</span>}
          </div>
          <span className={styles.days}>{daysLabel ?? `${days} 天`}</span>
        </Link>
        <div className={styles.actions}>
          {primaryEmail && (
            <a
              href={`mailto:${primaryEmail}`}
              className={styles.quickAction}
              aria-label={`寄信給 ${primary}`}
              title="寄信"
            >
              📧
            </a>
          )}
          {primaryPhone && (
            <a
              href={`tel:${primaryPhone}`}
              className={styles.quickAction}
              aria-label={`撥電話給 ${primary}`}
              title="撥電話"
            >
              📞
            </a>
          )}
          {lineUrl && (
            <a
              href={lineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.quickAction}
              aria-label={`LINE 聯絡 ${primary}`}
              title="LINE"
            >
              💬
            </a>
          )}
          <button
            type="button"
            className={styles.markBtn}
            onClick={handleMark}
            disabled={pending || stage === "picking"}
            aria-label={`標記已聯絡 ${primary}`}
          >
            {stage === "picking" ? "✓ 完成" : pending ? "記錄中…" : "✅ 已聯絡"}
          </button>
        </div>
      </div>
      {stage === "picking" && (
        <div className={styles.nextPicker} aria-label={`下次聯絡 ${primary}`}>
          <span className={styles.nextLabel}>下次聯絡：</span>
          {NEXT_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              className={styles.nextBtn}
              onClick={() => handlePick(opt)}
              disabled={pending}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {showAiDrafts && stage !== "picking" && (
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
