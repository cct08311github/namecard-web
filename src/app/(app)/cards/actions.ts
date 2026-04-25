"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import {
  bulkSoftDeleteCardsForUser,
  bulkUpdateCardsForUser,
  createCardForUser,
  getCardForUser,
  getCardsBySharedEvent,
  listCardsForUser,
  listContactEventsForUser,
  logContactEvent,
  mergeCardsForUser,
  setCardPinned,
  setFollowUpForUser,
  softDeleteCardForUser,
  updateCardForUser,
} from "@/db/cards";
import { cardCreateSchema, cardUpdateSchema } from "@/db/schema";
import { briefingCacheKey, type BriefingPick } from "@/lib/coach/briefing";
import { callBriefingLlm } from "@/lib/coach/briefing-llm";
import { readBriefingCache, writeBriefingCache } from "@/lib/coach/briefing-store";
import {
  contextHash,
  isEmptyInsight,
  type CoachContext,
  type CoachInsight,
} from "@/lib/coach/insights";
import { callCoachLlm, isCoachConfigured } from "@/lib/coach/llm";
import { selectTodayPriorityCards, type PriorityCandidate } from "@/lib/coach/priority";
import { readCoachCache, writeCoachCache } from "@/lib/coach/store";
import { pickCanonicalCompany } from "@/lib/companies/group";

export const createCardAction = authedAction
  .inputSchema(cardCreateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id } = await createCardForUser(parsedInput, {
      uid: ctx.user.uid,
      displayName: ctx.user.displayName,
    });
    revalidatePath("/");
    revalidatePath("/cards");
    return { id };
  });

export const updateCardAction = authedAction
  .inputSchema(
    z.object({
      id: z.string().min(1),
      input: cardUpdateSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await updateCardForUser(parsedInput.id, parsedInput.input, {
      uid: ctx.user.uid,
    });
    revalidatePath("/");
    revalidatePath("/cards");
    revalidatePath(`/cards/${parsedInput.id}`);
    return { ok: true as const };
  });

export const deleteCardAction = authedAction
  .inputSchema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await softDeleteCardForUser(parsedInput.id, { uid: ctx.user.uid });
    revalidatePath("/");
    revalidatePath("/cards");
    return { ok: true as const };
  });

/**
 * Log a contact event (optionally with a short note) and refresh the
 * card's lastContactedAt ranking signal. `touchCardAction` is kept as
 * a thin alias so existing callers (just mark-contacted) keep working.
 */
export const logContactAction = authedAction
  .inputSchema(
    z.object({
      id: z.string().min(1),
      note: z.string().max(500).default(""),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const eventId = await logContactEvent(parsedInput.id, {
      uid: ctx.user.uid,
      note: parsedInput.note,
      authorDisplay: ctx.user.displayName ?? null,
    });
    revalidatePath("/");
    revalidatePath(`/cards/${parsedInput.id}`);
    return { ok: true as const, eventId };
  });

const bulkPatchSchema = z
  .object({
    addTagIds: z.array(z.string().min(1).max(80)).max(30).optional(),
    addTagNames: z.array(z.string().min(1).max(60)).max(30).optional(),
    setEventTag: z.string().max(100).optional(),
    setPinned: z.boolean().optional(),
  })
  .refine(
    (p) =>
      Boolean(
        (p.addTagIds && p.addTagIds.length > 0) ||
        (p.addTagNames && p.addTagNames.length > 0) ||
        p.setEventTag !== undefined ||
        p.setPinned !== undefined,
      ),
    { message: "patch must touch at least one field" },
  );

/**
 * Apply the same patch to many cards at once. Skips cards the user
 * is not a member of. Used by /cards multi-select toolbar to
 * bulk-add tags / bulk-set event / bulk pin.
 */
export const bulkUpdateCardsAction = authedAction
  .inputSchema(
    z.object({
      ids: z.array(z.string().min(1)).min(1).max(500),
      patch: bulkPatchSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await bulkUpdateCardsForUser(ctx.user.uid, parsedInput.ids, parsedInput.patch);
    revalidatePath("/");
    revalidatePath("/cards");
    revalidatePath("/followups");
    return { ok: true as const, ...result };
  });

/**
 * Bulk soft-delete (sets deletedAt + reindex). Mirrors the single
 * deleteCardAction semantics across many ids.
 */
export const bulkSoftDeleteCardsAction = authedAction
  .inputSchema(
    z.object({
      ids: z.array(z.string().min(1)).min(1).max(500),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await bulkSoftDeleteCardsForUser(ctx.user.uid, parsedInput.ids);
    revalidatePath("/");
    revalidatePath("/cards");
    revalidatePath("/followups");
    return { ok: true as const, ...result };
  });

/**
 * Flip a card's pin state. Pinned cards appear in the Timeline's
 * Pinned section at the top and are excluded from 「最近沒聯絡」.
 */
export const toggleCardPinAction = authedAction
  .inputSchema(z.object({ id: z.string().min(1), pinned: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await setCardPinned(parsedInput.id, ctx.user.uid, parsedInput.pinned);
    revalidatePath("/");
    revalidatePath("/cards");
    revalidatePath(`/cards/${parsedInput.id}`);
    return { ok: true as const, pinned: parsedInput.pinned };
  });

/**
 * Merge N duplicate cards into a chosen "keep" card: union phones / emails /
 * tags / social, append notes with provenance, take max(lastContactedAt),
 * then soft-delete the merged ones. The /cards/duplicates page is the
 * primary caller; surface refuses if keepId appears in mergeIds.
 */
export const mergeCardsAction = authedAction
  .inputSchema(
    z.object({
      keepId: z.string().min(1),
      mergeIds: z.array(z.string().min(1)).min(1).max(20),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await mergeCardsForUser(ctx.user.uid, parsedInput.keepId, parsedInput.mergeIds);
    revalidatePath("/");
    revalidatePath("/cards");
    revalidatePath("/cards/duplicates");
    revalidatePath(`/cards/${parsedInput.keepId}`);
    return { ok: true as const, ...result };
  });

/**
 * Set or clear a follow-up reminder. `followUpAt` accepts a YYYY-MM-DD
 * date string or null. Empty string is treated as null (clear). Server
 * Action surface for the CardActions disclosure + 快捷鍵.
 */
export const setFollowUpAction = authedAction
  .inputSchema(
    z.object({
      id: z.string().min(1),
      followUpAt: z
        .string()
        .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), {
          message: "Invalid date (expected YYYY-MM-DD or empty)",
        })
        .nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const value =
      parsedInput.followUpAt && parsedInput.followUpAt !== "" ? parsedInput.followUpAt : null;
    await setFollowUpForUser(parsedInput.id, ctx.user.uid, value);
    revalidatePath("/");
    revalidatePath("/cards");
    revalidatePath(`/cards/${parsedInput.id}`);
    return { ok: true as const, followUpAt: value };
  });

/**
 * AI 人脈教練 — assemble the card's full context (events + company
 * mates + event mates + time-since-contact), call MiniMax, and return
 * three buckets of actionable insight. Cached 24h per (cardId,
 * contextHash) to keep the LLM bill small.
 *
 * Modes:
 *   - `force=true` ignores cache (regenerate button)
 *   - returns `{ ok: true, insight, cached }` on success
 *   - returns `{ ok: false, reason: "no-llm" | "card-not-found" | "llm-failed" }` otherwise
 */
export const getCoachInsightsAction = authedAction
  .inputSchema(
    z.object({
      cardId: z.string().min(1),
      force: z.boolean().optional().default(false),
    }),
  )
  .action(
    async ({
      parsedInput,
      ctx,
    }): Promise<
      | { ok: true; insight: CoachInsight; cached: boolean }
      | { ok: false; reason: "no-llm" | "card-not-found" | "llm-failed" }
    > => {
      if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
      const card = await getCardForUser(ctx.user.uid, parsedInput.cardId);
      if (!card || card.deletedAt) return { ok: false, reason: "card-not-found" };

      const [events, allCards, eventMatesRaw] = await Promise.all([
        listContactEventsForUser(card.id, ctx.user.uid, 10),
        listCardsForUser(ctx.user.uid, { limit: 500 }),
        card.firstMetEventTag
          ? getCardsBySharedEvent(ctx.user.uid, card.firstMetEventTag, card.id, 6).catch(() => [])
          : Promise.resolve([]),
      ]);

      const canonicalCompany = pickCanonicalCompany(card).toLowerCase().trim();
      const companyMates = canonicalCompany
        ? allCards
            .filter(
              (c) =>
                c.id !== card.id &&
                !c.deletedAt &&
                pickCanonicalCompany(c).toLowerCase().trim() === canonicalCompany,
            )
            .slice(0, 6)
        : [];

      const coachCtx: CoachContext = {
        card,
        events,
        companyMates,
        eventMates: eventMatesRaw,
        now: new Date(),
      };
      const hash = contextHash(coachCtx);

      if (!parsedInput.force) {
        const cached = await readCoachCache(ctx.user.uid, card.id, hash);
        if (cached && !isEmptyInsight(cached)) {
          return { ok: true, insight: cached, cached: true };
        }
      }

      const insight = await callCoachLlm(coachCtx);
      if (!insight || isEmptyInsight(insight)) {
        return { ok: false, reason: "llm-failed" };
      }
      await writeCoachCache(ctx.user.uid, card.id, hash, insight);
      return { ok: true, insight, cached: false };
    },
  );

/**
 * 📰 今日人脈簡報 — pure-fn priority scorer narrows top 5 candidates,
 * LLM picks 3 with human-voice reasons. Daily-cache keyed by
 * (date, sorted candidate ids) so opening the app multiple times
 * today returns the same picks (no ad-hoc regeneration).
 *
 * Returns picks paired with the original CardSummary so the UI can
 * render mini-cards without a second fetch.
 */
export const getDailyBriefingAction = authedAction
  .inputSchema(z.object({ force: z.boolean().optional().default(false) }))
  .action(
    async ({
      parsedInput,
      ctx,
    }): Promise<
      | {
          ok: true;
          picks: Array<{ pick: BriefingPick; candidate: PriorityCandidate }>;
          cached: boolean;
        }
      | { ok: false; reason: "no-llm" | "no-candidates" | "llm-failed" }
    > => {
      if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
      const allCards = await listCardsForUser(ctx.user.uid, { limit: 500 });
      const now = new Date();
      const candidates = selectTodayPriorityCards(allCards, { now });
      if (candidates.length === 0) return { ok: false, reason: "no-candidates" };

      const cacheKey = briefingCacheKey(
        now,
        candidates.map((c) => c.card.id),
      );
      const candidateById = new Map(candidates.map((c) => [c.card.id, c]));

      if (!parsedInput.force) {
        const cached = await readBriefingCache(ctx.user.uid, cacheKey);
        if (cached && cached.length > 0) {
          const picks = cached
            .map((pick) => {
              const candidate = candidateById.get(pick.cardId);
              return candidate ? { pick, candidate } : null;
            })
            .filter((x): x is { pick: BriefingPick; candidate: PriorityCandidate } => x !== null);
          if (picks.length > 0) return { ok: true, picks, cached: true };
        }
      }

      const llmPicks = await callBriefingLlm(candidates, now);
      if (!llmPicks || llmPicks.length === 0) {
        return { ok: false, reason: "llm-failed" };
      }
      await writeBriefingCache(ctx.user.uid, cacheKey, llmPicks);

      const picks = llmPicks
        .map((pick) => {
          const candidate = candidateById.get(pick.cardId);
          return candidate ? { pick, candidate } : null;
        })
        .filter((x): x is { pick: BriefingPick; candidate: PriorityCandidate } => x !== null);
      return { ok: true, picks, cached: false };
    },
  );

/**
 * @deprecated Prefer `logContactAction`. Retained so any existing
 * callers keep working; internally logs an empty-note event.
 */
export const touchCardAction = authedAction
  .inputSchema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await logContactEvent(parsedInput.id, {
      uid: ctx.user.uid,
      note: "",
      authorDisplay: ctx.user.displayName ?? null,
    });
    revalidatePath("/");
    revalidatePath(`/cards/${parsedInput.id}`);
    return { ok: true as const };
  });
