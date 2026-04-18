import { CARDS_QUERY_BY_FIELDS, CARDS_QUERY_BY_WEIGHTS } from "./schema";

/**
 * Pure builder for Typesense search params. Keep this free of the
 * Typesense client so we can UT it without a running instance.
 */

export type TagMode = "or" | "and";

export interface BuildSearchParamsInput {
  q: string;
  memberUid: string;
  tagIds?: string[];
  tagMode?: TagMode;
  limit?: number;
  offset?: number;
}

export interface TypesenseSearchParams {
  q: string;
  query_by: string;
  query_by_weights: string;
  filter_by: string;
  sort_by: string;
  highlight_fields: string;
  per_page: number;
  page: number;
  num_typos: number;
}

const DEFAULT_LIMIT = 30;

/**
 * Translate UI search state → Typesense query params.
 *
 * - `filter_by` always scopes to the caller's uid via `memberUids`, and
 *   optionally by `tagIds`. Typesense uses `&&` for AND and `||` for OR.
 * - `sort_by` prioritizes text-relevance, then recency via
 *   `lastContactedAt` (coalesces null to 0), then `createdAt`.
 * - Escaped filter values with `\` so backslashes / quotes in tag ids
 *   don't break the query.
 */
export function buildSearchParams({
  q,
  memberUid,
  tagIds = [],
  tagMode = "or",
  limit = DEFAULT_LIMIT,
  offset = 0,
}: BuildSearchParamsInput): TypesenseSearchParams {
  const query_by = CARDS_QUERY_BY_FIELDS.join(",");
  const query_by_weights = CARDS_QUERY_BY_FIELDS.map((f) => CARDS_QUERY_BY_WEIGHTS[f]).join(",");

  const filters: string[] = [`memberUids:=${escapeFilter(memberUid)}`];
  if (tagIds.length > 0) {
    const joined = tagIds.map(escapeFilter).join(",");
    // `tagIds:=[a,b]` matches any; duplicating with && for AND intent.
    if (tagMode === "and") {
      filters.push(...tagIds.map((t) => `tagIds:=${escapeFilter(t)}`));
    } else {
      filters.push(`tagIds:=[${joined}]`);
    }
  }

  return {
    q: q.trim() || "*",
    query_by,
    query_by_weights,
    filter_by: filters.join(" && "),
    sort_by: "_text_match:desc,lastContactedAt:desc,createdAt:desc",
    highlight_fields: "nameZh,nameEn,companyZh,companyEn,whyRemember,notes,tagNames",
    per_page: Math.max(1, Math.min(limit, 100)),
    page: Math.floor(offset / Math.max(1, limit)) + 1,
    num_typos: 1,
  };
}

function escapeFilter(value: string): string {
  // Typesense filter values with special chars need backtick-wrapping.
  if (/^[a-zA-Z0-9_-]+$/.test(value)) return value;
  // Escape backslashes FIRST so a rogue backslash can't neutralize the
  // backtick escape that follows, then escape the backticks themselves.
  const escaped = value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
  return `\`${escaped}\``;
}
