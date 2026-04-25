"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import {
  bulkSoftDeleteCardsForUser,
  bulkUpdateCardsForUser,
  createCardForUser,
  logContactEvent,
  mergeCardsForUser,
  setCardPinned,
  setFollowUpForUser,
  softDeleteCardForUser,
  updateCardForUser,
} from "@/db/cards";
import { cardCreateSchema, cardUpdateSchema } from "@/db/schema";

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
