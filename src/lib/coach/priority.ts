import type { CardSummary } from "@/db/cards";

import { findAnniversariesToday } from "@/lib/timeline/anniversaries";

export interface PriorityCandidate {
  card: CardSummary;
  /** Composite score, higher = more urgent. */
  score: number;
  /** Human-readable reason cluster ("followUp due", "anniversary", "stale-pinned", "uncontacted-30+"). */
  reason: PriorityReason;
  /** Days until / since the trigger, used by LLM to phrase the reason naturally. */
  daysOffset: number | null;
}

export type PriorityReason =
  | "followup-overdue"
  | "followup-due-today"
  | "anniversary"
  | "pinned-stale"
  | "uncontacted-long";

interface PriorityOptions {
  now: Date;
  /** Maximum candidates to return for the LLM picker. Default 5. */
  max?: number;
  /** Pinned cards re-engage threshold (days). Default 21. */
  pinnedStaleDays?: number;
  /** Generic uncontacted threshold (days). Default 30. */
  uncontactedDays?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Score-based ranker that picks today's highest-priority cards. Used by
 * the daily briefing as the initial candidate filter — the LLM then
 * narrows further (it can read the *content* of whyRemember / events,
 * which a pure scorer cannot).
 *
 * Score weights:
 *   followup-overdue:       100 + days-overdue * 2  (overdue followUp ages, never decays)
 *   followup-due-today:     90  (committed action today)
 *   anniversary:            80  + 5 * years (5 年週年比 1 年高)
 *   pinned-stale (≥ 21d):   60  + days-since-contact / 7
 *   uncontacted (≥ 30d):    40  + days-since-contact / 30 (capped at +20)
 *
 * A card can hit multiple categories — we keep its highest-scoring
 * reason so the LLM gets unambiguous context.
 */
export function selectTodayPriorityCards(
  cards: readonly CardSummary[],
  options: PriorityOptions,
): PriorityCandidate[] {
  const { now, max = 5, pinnedStaleDays = 21, uncontactedDays = 30 } = options;
  const live = cards.filter((c) => !c.deletedAt);
  const todayEnd = endOfDay(now);
  const anniversaryMap = new Map(
    findAnniversariesToday(live, now).map((e) => [e.card.id, e.years]),
  );

  const candidates: PriorityCandidate[] = [];

  for (const card of live) {
    const reasons: PriorityCandidate[] = [];

    if (card.followUpAt) {
      const days = daysBetween(todayEnd, card.followUpAt);
      if (days > 0) {
        reasons.push({
          card,
          score: 100 + Math.min(days * 2, 60),
          reason: "followup-overdue",
          daysOffset: days,
        });
      } else if (days === 0 || days === -0) {
        reasons.push({ card, score: 90, reason: "followup-due-today", daysOffset: 0 });
      }
    }

    const annivYears = anniversaryMap.get(card.id);
    if (annivYears !== undefined) {
      reasons.push({
        card,
        score: 80 + Math.min(annivYears * 5, 25),
        reason: "anniversary",
        daysOffset: annivYears,
      });
    }

    if (card.isPinned && card.lastContactedAt) {
      const days = daysBetween(now, card.lastContactedAt);
      if (days >= pinnedStaleDays) {
        reasons.push({
          card,
          score: 60 + Math.floor(days / 7),
          reason: "pinned-stale",
          daysOffset: days,
        });
      }
    } else if (card.isPinned && !card.lastContactedAt && card.createdAt) {
      const days = daysBetween(now, card.createdAt);
      if (days >= pinnedStaleDays) {
        reasons.push({
          card,
          score: 60 + Math.floor(days / 7),
          reason: "pinned-stale",
          daysOffset: days,
        });
      }
    }

    // Generic stale-uncontacted only for non-pinned cards (pinned already covered above).
    if (!card.isPinned) {
      const baseDate = card.lastContactedAt ?? card.createdAt;
      if (baseDate) {
        const days = daysBetween(now, baseDate);
        if (days >= uncontactedDays) {
          reasons.push({
            card,
            score: 40 + Math.min(Math.floor(days / 30), 20),
            reason: "uncontacted-long",
            daysOffset: days,
          });
        }
      }
    }

    if (reasons.length === 0) continue;
    // Keep the highest-scoring reason for this card.
    reasons.sort((a, b) => b.score - a.score);
    candidates.push(reasons[0]!);
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.card.id.localeCompare(b.card.id);
  });
  return candidates.slice(0, max);
}
