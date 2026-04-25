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
  listRecentContactEventsForUser,
  logContactEvent,
  mergeCardsForUser,
  setCardPinned,
  setFollowUpForUser,
  setPublicSlugForUser,
  softDeleteCardForUser,
  updateCardForUser,
} from "@/db/cards";
import { cardCreateSchema, cardUpdateSchema, publicSlugSchema } from "@/db/schema";
import { briefingCacheKey, type BriefingPick } from "@/lib/coach/briefing";
import { callBriefingLlm } from "@/lib/coach/briefing-llm";
import { readBriefingCache, writeBriefingCache } from "@/lib/coach/briefing-store";
import {
  contextHash,
  isEmptyInsight,
  type CoachContext,
  type CoachInsight,
} from "@/lib/coach/insights";
import {
  introsCacheKey,
  parseIntrosResponse,
  selectIntroCandidates,
  type IntroSuggestion,
} from "@/lib/coach/intros";
import { callIntrosLlm } from "@/lib/coach/intros-llm";
import { readIntrosCache, writeIntrosCache } from "@/lib/coach/intros-store";
import { callCoachLlm, isCoachConfigured } from "@/lib/coach/llm";
import { selectTodayPriorityCards, type PriorityCandidate } from "@/lib/coach/priority";
import { suggestNextFollowupDate, type FollowupSuggestion } from "@/lib/coach/followup-suggest";
import { callCardChatLlm } from "@/lib/coach/chat-llm";
import { actionItemsCacheMarker, type ActionItem } from "@/lib/coach/action-items";
import { callActionItemsLlm } from "@/lib/coach/action-items-llm";
import { readActionItemsCache, writeActionItemsCache } from "@/lib/coach/action-items-store";
import { reengageCacheKey, type ReengageContext, type ReengageDrafts } from "@/lib/coach/reengage";
import { callReengageLlm } from "@/lib/coach/reengage-llm";
import { readReengageCache, writeReengageCache } from "@/lib/coach/reengage-store";
import { readCoachCache, writeCoachCache } from "@/lib/coach/store";
import { pickCanonicalCompany } from "@/lib/companies/group";
import { encodePrefill, type ExtractedCard } from "@/lib/voice/extract";
import { callExtractLlm, callExtractLlmMulti } from "@/lib/voice/extract-llm";

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

      // Pull each candidate's most recent contact-event note to enrich
      // the LLM prompt with conversational context (logged via /log).
      // Sequential keeps the loop simple; N is bounded by selectToday-
      // PriorityCards' max=5, so total round-trips stay negligible.
      const recentNotes = new Map<string, string>();
      for (const c of candidates) {
        const events = await listContactEventsForUser(c.card.id, ctx.user.uid, 1);
        const note = events[0]?.note?.trim();
        if (note) recentNotes.set(c.card.id, note);
      }

      // Marker keeps the cache key sensitive to:
      //   - lastContactedAt updates (an event was logged → bumps the field)
      //   - the candidate set itself (already covered by sortedIds)
      // Without this, logging a fresh event would silently re-serve the
      // previous LLM pick that lacked the conversational hook.
      const marker = candidates
        .map((c) => `${c.card.id}:${c.card.lastContactedAt?.getTime() ?? 0}`)
        .sort()
        .join("|");
      const cacheKey = briefingCacheKey(
        now,
        candidates.map((c) => c.card.id),
        marker,
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

      const llmPicks = await callBriefingLlm(candidates, now, { recentNotes });
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
 * ✨ AI 重新聯絡訊息草稿 — for a single card, ask MiniMax to produce
 * 3 ready-to-send drafts (LINE 短訊 / Email 正式 / 偶遇式 hook) given
 * whyRemember + days-since-contact + recent events. Cached 12h per
 * (cardId, contextHash with staleness bucket).
 */
export const getReengageDraftsAction = authedAction
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
      | { ok: true; drafts: ReengageDrafts; cached: boolean }
      | { ok: false; reason: "no-llm" | "card-not-found" | "llm-failed" }
    > => {
      if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
      const card = await getCardForUser(ctx.user.uid, parsedInput.cardId);
      if (!card || card.deletedAt) return { ok: false, reason: "card-not-found" };

      const recentEvents = await listContactEventsForUser(card.id, ctx.user.uid, 5);
      const reengageCtx: ReengageContext = { card, recentEvents, now: new Date() };
      const hash = reengageCacheKey(reengageCtx);

      if (!parsedInput.force) {
        const cached = await readReengageCache(ctx.user.uid, card.id, hash);
        if (cached) return { ok: true, drafts: cached, cached: true };
      }

      const drafts = await callReengageLlm(reengageCtx);
      if (!drafts) return { ok: false, reason: "llm-failed" };
      await writeReengageCache(ctx.user.uid, card.id, hash, drafts);
      return { ok: true, drafts, cached: false };
    },
  );

/**
 * Set or clear the card's public profile slug. When set, the card is
 * reachable at /u/{slug} (no auth needed). Server-side validates slug
 * format + reserved words + uniqueness across all workspaces. Returns
 * the resolved slug on success or a friendly error message on conflict.
 */
export const setPublicSlugAction = authedAction
  .inputSchema(
    z.object({
      cardId: z.string().min(1),
      slug: z.union([publicSlugSchema, z.literal("")]).nullable(),
    }),
  )
  .action(
    async ({
      parsedInput,
      ctx,
    }): Promise<{ ok: true; slug: string | null } | { ok: false; reason: string }> => {
      const desired =
        parsedInput.slug && parsedInput.slug !== "" ? parsedInput.slug.toLowerCase() : null;
      try {
        await setPublicSlugForUser(parsedInput.cardId, ctx.user.uid, desired);
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : "操作失敗" };
      }
      revalidatePath("/");
      revalidatePath("/cards");
      revalidatePath(`/cards/${parsedInput.cardId}`);
      if (desired) revalidatePath(`/u/${desired}`);
      return { ok: true, slug: desired };
    },
  );

/**
 * 🤝 AI 介紹建議 — assemble candidates → LLM picks 3-5 (cardA, cardB)
 * pairs with reason + ready-to-send intro email. Cached weekly so
 * suggestions feel like a "weekly digest" not a daily churn.
 */
export const getIntroSuggestionsAction = authedAction
  .inputSchema(z.object({ force: z.boolean().optional().default(false) }))
  .action(
    async ({
      parsedInput,
      ctx,
    }): Promise<
      | {
          ok: true;
          intros: Array<{
            intro: IntroSuggestion;
            cardA: PriorityCandidate["card"];
            cardB: PriorityCandidate["card"];
          }>;
          cached: boolean;
        }
      | { ok: false; reason: "no-llm" | "too-few-cards" | "llm-failed" }
    > => {
      if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
      const allCards = await listCardsForUser(ctx.user.uid, { limit: 500 });
      const candidates = selectIntroCandidates(allCards);
      if (candidates.length < 4) return { ok: false, reason: "too-few-cards" };

      const cacheKey = introsCacheKey(
        new Date(),
        candidates.map((c) => c.id),
      );
      const candidateById = new Map(candidates.map((c) => [c.id, c]));

      let intros = parsedInput.force ? null : await readIntrosCache(ctx.user.uid, cacheKey);
      if (!intros) {
        intros = await callIntrosLlm(candidates);
        if (!intros || intros.length === 0) {
          return { ok: false, reason: "llm-failed" };
        }
        await writeIntrosCache(ctx.user.uid, cacheKey, intros);
      } else {
        // Re-validate cached cardIds against current candidate set so a
        // recently-merged / deleted card doesn't surface a dangling pair.
        const validIds = new Set(candidates.map((c) => c.id));
        intros = parseIntrosResponse(JSON.stringify({ intros }), validIds);
      }

      const paired = intros
        .map((intro) => {
          const cardA = candidateById.get(intro.cardAId);
          const cardB = candidateById.get(intro.cardBId);
          return cardA && cardB ? { intro, cardA, cardB } : null;
        })
        .filter(
          (
            x,
          ): x is {
            intro: IntroSuggestion;
            cardA: PriorityCandidate["card"];
            cardB: PriorityCandidate["card"];
          } => x !== null,
        );

      return { ok: true, intros: paired, cached: !parsedInput.force && paired.length > 0 };
    },
  );

/**
 * 🎙️ Voice-to-card extract — take a free-form text describing the
 * person the user just met (typed or transcribed from voice) and
 * return a Partial<CardCreateInput> via MiniMax. The /cards/voice
 * page calls this, then redirects to /cards/new?prefill=... so the
 * user reviews + commits via the normal create flow.
 */
export const extractCardFromTextAction = authedAction
  .inputSchema(z.object({ text: z.string().min(3).max(2000) }))
  .action(
    async ({
      parsedInput,
    }): Promise<
      | { ok: true; extracted: ExtractedCard; prefillToken: string }
      | { ok: false; reason: "no-llm" | "llm-failed" }
    > => {
      if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
      const extracted = await callExtractLlm(parsedInput.text);
      if (!extracted) return { ok: false, reason: "llm-failed" };
      return { ok: true, extracted, prefillToken: encodePrefill(extracted) };
    },
  );

/**
 * 🎙️ Voice-to-card *multi*-extract — same MiniMax hop as single, but
 * returns ALL cards the LLM detected. Networking event 後 user 一次說
 * 「認識三個人：A 是…、B 是…、C 是…」會回 3 張卡。
 */
export const extractMultipleCardsAction = authedAction
  .inputSchema(z.object({ text: z.string().min(3).max(4000) }))
  .action(
    async ({
      parsedInput,
    }): Promise<
      { ok: true; extracted: ExtractedCard[] } | { ok: false; reason: "no-llm" | "llm-failed" }
    > => {
      if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
      const cards = await callExtractLlmMulti(parsedInput.text);
      if (cards.length === 0) return { ok: false, reason: "llm-failed" };
      return { ok: true, extracted: cards };
    },
  );

/**
 * Batch-create N cards in one Server Action call. Used by the
 * voice-multi flow after the user reviews the AI-extracted preview.
 * Each card runs through the same `createCardForUser` so memberUids /
 * Typesense reindex / etc. all behave identically to single create.
 */
export const createCardsBatchAction = authedAction
  .inputSchema(
    z.object({
      cards: z.array(cardCreateSchema).min(1).max(20),
    }),
  )
  .action(
    async ({
      parsedInput,
      ctx,
    }): Promise<{ ok: true; ids: string[] } | { ok: false; reason: string }> => {
      const ids: string[] = [];
      for (const card of parsedInput.cards) {
        try {
          const { id } = await createCardForUser(card, {
            uid: ctx.user.uid,
            displayName: ctx.user.displayName,
          });
          ids.push(id);
        } catch (err) {
          if (ids.length > 0) {
            revalidatePath("/");
            revalidatePath("/cards");
          }
          return {
            ok: false,
            reason: err instanceof Error ? err.message : "建立失敗",
          };
        }
      }
      revalidatePath("/");
      revalidatePath("/cards");
      return { ok: true, ids };
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

/**
 * ✨ Smart followup suggest — returns a date for the next ping based on
 * the user's actual conversation cadence with this card. No LLM call;
 * pure math over recent contact-events. Falls back to a default 30 days
 * when there's not enough history to compute a rhythm.
 */
export const getFollowupSuggestionAction = authedAction
  .inputSchema(z.object({ cardId: z.string().min(1) }))
  .action(
    async ({
      parsedInput,
      ctx,
    }): Promise<
      { ok: true; suggestion: FollowupSuggestion } | { ok: false; reason: "card-not-found" }
    > => {
      const card = await getCardForUser(ctx.user.uid, parsedInput.cardId);
      if (!card || card.deletedAt) return { ok: false, reason: "card-not-found" };
      const events = await listContactEventsForUser(card.id, ctx.user.uid, 10);
      const suggestion = suggestNextFollowupDate(card, events, new Date());
      return { ok: true, suggestion };
    },
  );

/**
 * 💬 Per-card AI Q&A — answer a free-form question about a contact
 * grounded in their card + recent events. Single-shot (no multi-turn
 * memory yet); cache disabled because questions are unique-per-call.
 * The pure module enforces an anti-hallucination prompt; LLM is told
 * to refuse when context is insufficient instead of guessing.
 */
export const askCardQuestionAction = authedAction
  .inputSchema(
    z.object({
      cardId: z.string().min(1),
      question: z.string().min(2).max(500),
    }),
  )
  .action(
    async ({
      parsedInput,
      ctx,
    }): Promise<
      | { ok: true; answer: string }
      | { ok: false; reason: "no-llm" | "card-not-found" | "llm-failed" }
    > => {
      if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
      const card = await getCardForUser(ctx.user.uid, parsedInput.cardId);
      if (!card || card.deletedAt) return { ok: false, reason: "card-not-found" };
      const events = await listContactEventsForUser(card.id, ctx.user.uid, 10);
      const answer = await callCardChatLlm({ card, events }, parsedInput.question);
      if (!answer) return { ok: false, reason: "llm-failed" };
      return { ok: true, answer };
    },
  );

/**
 * ✨ AI Action Items — scan recent /log entries, return things the user
 * promised to do but hasn't followed up on. Uses the same /recap-style
 * input range (default 14 days) and caches per item-fingerprint marker
 * so a no-op page reload doesn't re-burn LLM credits.
 */
export const getActionItemsAction = authedAction
  .inputSchema(
    z.object({
      sinceDays: z.number().int().min(1).max(60).default(14),
      force: z.boolean().optional().default(false),
    }),
  )
  .action(
    async ({
      parsedInput,
      ctx,
    }): Promise<
      | { ok: true; items: ActionItem[]; cached: boolean }
      | { ok: false; reason: "no-llm" | "no-events" | "llm-failed" }
    > => {
      if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
      const recap = await listRecentContactEventsForUser(ctx.user.uid, parsedInput.sinceDays);
      if (recap.length === 0) return { ok: false, reason: "no-events" };

      const marker = actionItemsCacheMarker(recap);
      const cacheKey = `v1::since=${parsedInput.sinceDays}::${marker}`;

      if (!parsedInput.force) {
        const cached = await readActionItemsCache(ctx.user.uid, cacheKey);
        if (cached) {
          return { ok: true, items: cached, cached: true };
        }
      }

      const items = await callActionItemsLlm(recap);
      if (items === null) return { ok: false, reason: "llm-failed" };
      await writeActionItemsCache(ctx.user.uid, cacheKey, items);
      return { ok: true, items, cached: false };
    },
  );
