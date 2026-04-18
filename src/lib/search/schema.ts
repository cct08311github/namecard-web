import type { CollectionCreateSchema } from "typesense/lib/Typesense/Collections";

/**
 * Typesense `cards` collection schema — mirrors the indexed subset of the
 * Firestore card document. Only fields we actually search or filter on
 * live here; the full card still lives in Firestore (Typesense is a
 * read-side index, not the source of truth).
 *
 * CJK searchability: every text field carries `locale: "zh"` so the
 * tokenizer splits Chinese properly. Acceptance criteria 中文「陳」命中
 * 「陳志明」 is enforced by SIT against this schema.
 *
 * Ranking: `lastContactedAt` defaulted to 0 (older than epoch) when a
 * card has never been contacted so sort_by puts recently-contacted first
 * without nulls leaking.
 */

export const CARDS_COLLECTION_NAME = "cards";

export const cardsCollectionSchema: CollectionCreateSchema = {
  name: CARDS_COLLECTION_NAME,
  // token_separators split common card tokens (LINE IDs, emails, phone
  // dashes) into searchable pieces without touching CJK.
  token_separators: ["-", "_", "@", ".", "/"],
  fields: [
    { name: "cardId", type: "string" },
    { name: "workspaceId", type: "string", facet: true },
    { name: "memberUids", type: "string[]", facet: true },

    // Searchable CJK text fields — weighted in query_by_weights.
    { name: "nameZh", type: "string", locale: "zh", optional: true },
    { name: "nameEn", type: "string", optional: true },
    { name: "companyZh", type: "string", locale: "zh", optional: true },
    { name: "companyEn", type: "string", optional: true },
    { name: "jobTitleZh", type: "string", locale: "zh", optional: true },
    { name: "jobTitleEn", type: "string", optional: true },
    { name: "whyRemember", type: "string", locale: "zh", optional: true },
    { name: "notes", type: "string", locale: "zh", optional: true },

    // Tag filter + search surface (facet=true enables Typesense `filter_by`).
    { name: "tagIds", type: "string[]", facet: true, optional: true },
    { name: "tagNames", type: "string[]", locale: "zh", facet: true, optional: true },

    // Ranking signals.
    { name: "lastContactedAt", type: "int64", optional: true },
    { name: "createdAt", type: "int64" },
  ],
  // Secondary sort — first by text match, then recency; we set this at
  // query time via `sort_by`, but declaring default_sorting_field keeps
  // typeahead responses well-ordered without an explicit sort.
  default_sorting_field: "createdAt",
};

/**
 * Per-field weights applied at query time. Higher = more important.
 * Intent: 最近見面 > 公司精確匹配 > 名字匹配 > tag 匹配 — we get 最近見面
 * via `sort_by: lastContactedAt:desc` and the rest via these weights.
 */
export const CARDS_QUERY_BY_WEIGHTS = {
  nameZh: 4,
  nameEn: 4,
  companyZh: 3,
  companyEn: 3,
  tagNames: 2,
  whyRemember: 1,
  notes: 1,
  jobTitleZh: 1,
  jobTitleEn: 1,
} as const;

/**
 * Fields concatenated into the Typesense `query_by` string, in priority
 * order. Typesense requires this alignment with `CARDS_QUERY_BY_WEIGHTS`.
 */
export const CARDS_QUERY_BY_FIELDS: Array<keyof typeof CARDS_QUERY_BY_WEIGHTS> = [
  "nameZh",
  "nameEn",
  "companyZh",
  "companyEn",
  "tagNames",
  "whyRemember",
  "notes",
  "jobTitleZh",
  "jobTitleEn",
];
