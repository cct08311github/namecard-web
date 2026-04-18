"use server";

import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import { getTypesenseClient } from "@/lib/search/client";
import { buildSearchParams, type TagMode } from "@/lib/search/query";
import { CARDS_COLLECTION_NAME } from "@/lib/search/schema";

/**
 * Search action — returns typed hits with highlights + timing. Degrades
 * to a `degraded` flag when Typesense is unreachable so the UI can
 * fall back to client-side filtering of already-loaded cards.
 */

export interface SearchHit {
  id: string;
  nameZh?: string;
  nameEn?: string;
  companyZh?: string;
  companyEn?: string;
  whyRemember?: string;
  tagNames?: string[];
  highlights: Record<string, string>;
}

export interface SearchResponse {
  hits: SearchHit[];
  found: number;
  searchTimeMs: number;
  degraded: boolean;
}

const inputSchema = z.object({
  q: z.string().max(200).default(""),
  tagIds: z.array(z.string().max(80)).max(20).default([]),
  tagMode: z.enum(["or", "and"]).default("or"),
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).default(0),
});

function typesenseConfigured(): boolean {
  return Boolean(process.env.TYPESENSE_HOST && process.env.TYPESENSE_API_KEY);
}

export const searchCardsAction = authedAction
  .inputSchema(inputSchema)
  .action(async ({ parsedInput, ctx }): Promise<SearchResponse> => {
    if (!typesenseConfigured()) {
      return { hits: [], found: 0, searchTimeMs: 0, degraded: true };
    }
    const params = buildSearchParams({
      q: parsedInput.q,
      memberUid: ctx.user.uid,
      tagIds: parsedInput.tagIds,
      tagMode: parsedInput.tagMode as TagMode,
      limit: parsedInput.limit,
      offset: parsedInput.offset,
    });

    const started = Date.now();
    try {
      const res = await getTypesenseClient()
        .collections(CARDS_COLLECTION_NAME)
        .documents()
        .search(params);
      const hits: SearchHit[] = (res.hits ?? []).map((h) => {
        const doc = h.document as {
          id: string;
          nameZh?: string;
          nameEn?: string;
          companyZh?: string;
          companyEn?: string;
          whyRemember?: string;
          tagNames?: string[];
        };
        const highlights: Record<string, string> = {};
        for (const hi of h.highlights ?? []) {
          const field = hi.field;
          const snippet = hi.snippet ?? (hi.snippets ?? [])[0];
          if (field && snippet) highlights[field] = snippet;
        }
        return {
          id: doc.id,
          nameZh: doc.nameZh,
          nameEn: doc.nameEn,
          companyZh: doc.companyZh,
          companyEn: doc.companyEn,
          whyRemember: doc.whyRemember,
          tagNames: doc.tagNames,
          highlights,
        };
      });
      return {
        hits,
        found: res.found ?? hits.length,
        searchTimeMs: Date.now() - started,
        degraded: false,
      };
    } catch (err) {
      console.error("[search] query failed:", err instanceof Error ? err.message : err);
      return { hits: [], found: 0, searchTimeMs: Date.now() - started, degraded: true };
    }
  });
