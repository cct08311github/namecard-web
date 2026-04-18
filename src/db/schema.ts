import { z } from "zod";

/**
 * Firestore schema & Zod validators.
 *
 * Invariant: collection path is workspaces/{wid}/cards/{cardId} from day 1.
 * Personal use = wid === uid. See AGENTS.md.
 */

export const timestampSchema = z.union([
  z.date(),
  z.object({
    _seconds: z.number(),
    _nanoseconds: z.number(),
  }),
  z.object({
    seconds: z.number(),
    nanoseconds: z.number(),
  }),
]);

const phoneLabelSchema = z.enum(["mobile", "office", "home", "fax", "other"]);
const emailLabelSchema = z.enum(["work", "personal", "other"]);

export const phoneSchema = z.object({
  label: phoneLabelSchema,
  value: z.string().min(1).max(40),
  primary: z.boolean().optional(),
});

export const emailEntrySchema = z.object({
  label: emailLabelSchema,
  value: z.string().email().max(200),
  primary: z.boolean().optional(),
});

export const addressSchema = z.object({
  label: z.string().max(30).optional(),
  line1: z.string().max(200).optional(),
  line2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  postalCode: z.string().max(30).optional(),
});

export const socialSchema = z.object({
  lineId: z.string().max(100).optional(),
  wechatId: z.string().max(100).optional(),
  linkedinUrl: z.string().max(500).optional(),
  twitterHandle: z.string().max(60).optional(),
  instagramHandle: z.string().max(60).optional(),
  facebookUrl: z.string().max(500).optional(),
  websiteUrl: z.string().max(500).optional(),
});

/** Base schema shared between create / update / DB representation. */
const cardBaseShape = {
  // Names (中英文分開，東亞名片常見)
  nameZh: z.string().max(100).optional(),
  nameEn: z.string().max(100).optional(),
  namePhonetic: z.string().max(100).optional(),

  // Job
  jobTitleZh: z.string().max(100).optional(),
  jobTitleEn: z.string().max(100).optional(),
  department: z.string().max(100).optional(),

  // Company
  companyZh: z.string().max(100).optional(),
  companyEn: z.string().max(100).optional(),
  companyWebsite: z.string().max(500).optional(),

  // Multi-value
  phones: z.array(phoneSchema).max(10).default([]),
  emails: z.array(emailEntrySchema).max(10).default([]),
  addresses: z.array(addressSchema).max(5).default([]),
  social: socialSchema.default({}),

  // Relationship context (差異化核心)
  whyRemember: z.string().min(1, "「為什麼記得這個人」為必填").max(500),
  firstMetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  firstMetContext: z.string().max(300).optional(),
  firstMetEventTag: z.string().max(60).optional(),
  notes: z.string().max(4000).optional(),
  lastContactedAt: timestampSchema.optional(),

  // Images
  frontImagePath: z.string().max(500).optional(),
  backImagePath: z.string().max(500).optional(),

  // OCR metadata (filled by Phase 3)
  ocrProvider: z.string().max(60).optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
  ocrRawJson: z.record(z.string(), z.unknown()).optional(),

  // Tags (denormalized — tagIds for query, tagNames for display)
  tagIds: z.array(z.string().max(80)).max(30).default([]),
  tagNames: z.array(z.string().max(60)).max(30).default([]),
};

/** Payload shape when creating a card (client → server). */
export const cardCreateSchema = z
  .object({
    ...cardBaseShape,
  })
  .refine(
    (card) =>
      Boolean(card.nameZh || card.nameEn) || card.emails.length > 0 || card.phones.length > 0,
    { message: "名片至少需填姓名、Email 或電話其中一項" },
  );

/** Payload shape when updating a card. */
export const cardUpdateSchema = z
  .object({
    ...cardBaseShape,
  })
  .partial();

/** Full card document as stored in Firestore (includes meta). */
export const cardDocSchema = z.object({
  ...cardBaseShape,
  id: z.string(),
  workspaceId: z.string(),
  ownerUid: z.string(),
  memberUids: z.array(z.string()).min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  deletedAt: timestampSchema.nullable().optional(),
});

export type Phone = z.infer<typeof phoneSchema>;
export type EmailEntry = z.infer<typeof emailEntrySchema>;
export type Address = z.infer<typeof addressSchema>;
export type Social = z.infer<typeof socialSchema>;
export type CardCreateInput = z.infer<typeof cardCreateSchema>;
export type CardUpdateInput = z.infer<typeof cardUpdateSchema>;
export type CardDoc = z.infer<typeof cardDocSchema>;

/** Tag document. */
export const tagDocSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string().min(1).max(60),
  color: z
    .string()
    .regex(/^oklch\(.+\)$|^#[0-9a-f]{3,8}$/i)
    .optional(),
  createdAt: timestampSchema,
});

export const tagCreateSchema = tagDocSchema
  .pick({ name: true, color: true })
  .partial({ color: true });

export type TagDoc = z.infer<typeof tagDocSchema>;
export type TagCreateInput = z.infer<typeof tagCreateSchema>;

/** Workspace document. */
export const workspaceDocSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100),
  ownerUid: z.string(),
  memberUids: z.array(z.string()).min(1),
  createdAt: timestampSchema,
});

export type WorkspaceDoc = z.infer<typeof workspaceDocSchema>;
