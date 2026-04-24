"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authedAction } from "@/lib/auth/safe-action";
import {
  createCardForUser,
  logContactEvent,
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
