"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import { listCardsForUser, logContactEvent, type CardSummary } from "@/db/cards";
import { isCoachConfigured } from "@/lib/coach/llm";
import { callConversationLogLlm } from "@/lib/conversations/extract-llm";
import { matchPersonName } from "@/lib/conversations/match";

export type ExtractConversationResult =
  | {
      ok: true;
      personName: string;
      summary: string;
      candidates: CardSummary[];
    }
  | { ok: false; reason: "no-llm" | "llm-failed" };

/**
 * Pure-extract step. Sends the user's free-form sentence to the LLM,
 * normalizes the response, then runs an in-memory fuzzy name match
 * against the caller's existing cards.
 *
 * No mutation here — the second action does the actual write so the user
 * gets a chance to confirm / pick / edit the summary first.
 */
export const extractConversationAction = authedAction
  .inputSchema(z.object({ text: z.string().min(3).max(2000) }))
  .action(async ({ parsedInput, ctx }): Promise<ExtractConversationResult> => {
    if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
    const extracted = await callConversationLogLlm(parsedInput.text);
    if (!extracted) return { ok: false, reason: "llm-failed" };

    const cards = await listCardsForUser(ctx.user.uid, { limit: 1000 });
    const candidates = matchPersonName(extracted.personName, cards);
    return {
      ok: true,
      personName: extracted.personName,
      summary: extracted.summary,
      candidates,
    };
  });

export type LogConversationResult = { ok: true; eventId: string } | { ok: false; reason: string };

/**
 * Append a contact-event to a chosen card. Reuses the existing
 * `logContactEvent` (db) and `revalidatePath` plumbing so this flow
 * stays consistent with the in-card-detail "log interaction" button.
 */
export const logConversationAction = authedAction
  .inputSchema(
    z.object({
      cardId: z.string().min(1),
      summary: z.string().min(1).max(500),
    }),
  )
  .action(async ({ parsedInput, ctx }): Promise<LogConversationResult> => {
    try {
      const eventId = await logContactEvent(parsedInput.cardId, {
        uid: ctx.user.uid,
        note: parsedInput.summary,
        authorDisplay: ctx.user.displayName ?? null,
      });
      revalidatePath("/");
      revalidatePath(`/cards/${parsedInput.cardId}`);
      return { ok: true, eventId };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "記錄失敗",
      };
    }
  });
