import { z } from "zod";

/**
 * URL state for search + tag filter. Shareable via
 * `/cards?q=...&tag=...&tagMode=and`. Zod-validated so unknown params
 * degrade gracefully instead of blowing up the route.
 */

const MAX_Q_LENGTH = 200;

export const searchUrlStateSchema = z.object({
  q: z
    .string()
    .default("")
    // Truncate first so an over-long q degrades gracefully instead of
    // being rejected and defaulting to empty.
    .transform((v) => v.trim().slice(0, MAX_Q_LENGTH)),
  tag: z.array(z.string().min(1).max(80)).default([]),
  tagMode: z.enum(["or", "and"]).default("or"),
});

export type SearchUrlState = z.infer<typeof searchUrlStateSchema>;

/**
 * Parse Next.js `searchParams` (values may be string | string[] | undef)
 * into a typed, defaulted SearchUrlState. Unknown input → safe defaults.
 */
export function parseSearchParams(
  raw: Record<string, string | string[] | undefined> | URLSearchParams,
): SearchUrlState {
  const pick = (key: string): string | string[] | undefined => {
    if (raw instanceof URLSearchParams) {
      const all = raw.getAll(key);
      if (all.length === 0) return undefined;
      if (all.length === 1) return all[0];
      return all;
    }
    return raw[key];
  };
  const q = pickString(pick("q"));
  const tag = pickStringArray(pick("tag"));
  const tagMode = pickString(pick("tagMode"));
  const parsed = searchUrlStateSchema.safeParse({ q, tag, tagMode });
  return parsed.success ? parsed.data : { q: "", tag: [], tagMode: "or" };
}

/** Inverse — build `URLSearchParams` from a state object. Empty state → empty URL. */
export function toSearchParams(state: Partial<SearchUrlState>): URLSearchParams {
  const sp = new URLSearchParams();
  if (state.q && state.q.trim()) sp.set("q", state.q.trim());
  if (state.tag && state.tag.length > 0) {
    for (const t of state.tag) sp.append("tag", t);
  }
  if (state.tagMode && state.tagMode !== "or") sp.set("tagMode", state.tagMode);
  return sp;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function pickStringArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (v.includes(","))
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [v];
}
