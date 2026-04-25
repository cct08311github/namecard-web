"use server";

import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import { listRecentContactEventsForUser } from "@/db/cards";
import { isCoachConfigured } from "@/lib/coach/llm";
import { callRecapThemesLlm } from "@/lib/recap/themes-llm";
import { themesCacheMarker } from "@/lib/recap/themes";
import { readThemesCache, writeThemesCache } from "@/lib/recap/themes-store";

export type RecapThemesResult =
  | { ok: true; themes: string[]; cached: boolean }
  | { ok: false; reason: "no-llm" | "no-items" | "llm-failed" };

/**
 * AI 本週主題 — extract 3-5 short themes from the user's recent /log
 * entries. Cached at workspaces/{wid}/recap/themes; cache key includes
 * an items-fingerprint marker so a new event invalidates it but a
 * no-op page reload doesn't reburn the LLM call.
 */
export const getRecapThemesAction = authedAction
  .inputSchema(
    z.object({
      sinceDays: z.number().int().min(1).max(60).default(14),
      force: z.boolean().optional().default(false),
    }),
  )
  .action(async ({ parsedInput, ctx }): Promise<RecapThemesResult> => {
    if (!isCoachConfigured()) return { ok: false, reason: "no-llm" };
    const items = await listRecentContactEventsForUser(ctx.user.uid, parsedInput.sinceDays);
    if (items.length === 0) return { ok: false, reason: "no-items" };

    const marker = themesCacheMarker(items);
    const cacheKey = `v1::since=${parsedInput.sinceDays}::${marker}`;

    if (!parsedInput.force) {
      const cached = await readThemesCache(ctx.user.uid, cacheKey);
      if (cached && cached.length > 0) {
        return { ok: true, themes: cached, cached: true };
      }
    }

    const themes = await callRecapThemesLlm(items);
    if (!themes || themes.length === 0) return { ok: false, reason: "llm-failed" };
    await writeThemesCache(ctx.user.uid, cacheKey, themes);
    return { ok: true, themes, cached: false };
  });
