"use server";

import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import { listCardsForUser, listRecentContactEventsForUser } from "@/db/cards";
import { isCoachConfigured } from "@/lib/coach/llm";
import { aggregateStats } from "@/lib/stats/aggregate";
import { digestCacheMarker } from "@/lib/stats/digest";
import { callDigestLlm } from "@/lib/stats/digest-llm";
import { readDigestCache, writeDigestCache } from "@/lib/stats/digest-store";

export type WeeklyDigestResult =
  | { ok: true; digest: string; cached: boolean }
  | { ok: false; reason: "no-llm" | "no-data" | "llm-failed" };

/**
 * ✨ AI 本週摘要 — turns the /stats numbers into a 1-2 sentence prose
 * summary. Cached at workspaces/{wid}/stats/digest with a fingerprint
 * marker so a no-op page reload doesn't reburn LLM credits.
 */
export const getWeeklyDigestAction = authedAction
  .inputSchema(z.object({ force: z.boolean().optional().default(false) }))
  .action(async ({ parsedInput, ctx }): Promise<WeeklyDigestResult> => {
    if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };

    const now = new Date();
    const [cards, events] = await Promise.all([
      listCardsForUser(ctx.user.uid, { limit: 1000 }),
      listRecentContactEventsForUser(ctx.user.uid, 30),
    ]);
    const stats = aggregateStats(cards, events, now);

    // Hide on truly empty data — nothing meaningful to summarize.
    if (stats.totalCards === 0 && stats.thisMonth.logCount === 0) {
      return { ok: false, reason: "no-data" };
    }

    const cacheKey = `v1::${digestCacheMarker(stats)}`;

    if (!parsedInput.force) {
      const cached = await readDigestCache(ctx.user.uid, cacheKey);
      if (cached) return { ok: true, digest: cached, cached: true };
    }

    const digest = await callDigestLlm(stats);
    if (!digest) return { ok: false, reason: "llm-failed" };
    await writeDigestCache(ctx.user.uid, cacheKey, digest);
    return { ok: true, digest, cached: false };
  });
