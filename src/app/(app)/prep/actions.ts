"use server";

import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import {
  listCardsForUser,
  listContactEventsForUser,
  type CardSummary,
  type ContactEvent,
} from "@/db/cards";
import { matchPersonName } from "@/lib/conversations/match";
import { extractAttendeeNames } from "@/lib/prep/parse";

export interface PrepCandidate {
  card: CardSummary;
  /** Most recent contact-event note for this card, or null if none. */
  lastEventNote: string | null;
  /** ISO YYYY-MM-DD of the latest event, or null. */
  lastEventDate: string | null;
}

export interface PrepResult {
  /** Original attendee name token from the input text. */
  name: string;
  /** Cards matched against this name (0..N). Pre-sorted by lastContactedAt desc. */
  candidates: PrepCandidate[];
}

function isoLocalDate(d: Date | null | undefined): string | null {
  if (!d || d.getTime() <= 0) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

/**
 * Parse the user's freeform attendees text → match each name against
 * existing cards → fetch the latest event note per matched card. Single
 * Server Action so the client can render the whole prep board after one
 * round-trip. No LLM (heuristic parser handles the messy input).
 */
export const findAttendeesAction = authedAction
  .inputSchema(z.object({ text: z.string().min(2).max(2000) }))
  .action(async ({ parsedInput, ctx }): Promise<{ ok: true; results: PrepResult[] }> => {
    const names = extractAttendeeNames(parsedInput.text);
    if (names.length === 0) return { ok: true, results: [] };

    const cards = await listCardsForUser(ctx.user.uid, { limit: 1000 });

    const results: PrepResult[] = [];
    for (const name of names) {
      const matched = matchPersonName(name, cards);
      const candidates: PrepCandidate[] = [];
      for (const card of matched.slice(0, 5)) {
        // 1 round-trip per matched card; bounded by 5 × names.
        const events: ContactEvent[] = await listContactEventsForUser(card.id, ctx.user.uid, 1);
        const latest = events[0];
        candidates.push({
          card,
          lastEventNote: latest?.note?.trim() || null,
          lastEventDate: isoLocalDate(latest?.at),
        });
      }
      results.push({ name, candidates });
    }
    return { ok: true, results };
  });
