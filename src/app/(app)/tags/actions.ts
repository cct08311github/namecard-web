"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createTagForUser, deleteTagForUser, recolorTagForUser, renameTagForUser } from "@/db/tags";
import { authedAction } from "@/lib/auth/safe-action";
import { TAG_PALETTE } from "@/lib/tags/palette";

const paletteOklch = TAG_PALETTE.map((p) => p.oklch) as [string, ...string[]];
const colorSchema = z.enum(paletteOklch).optional();

export const createTagAction = authedAction
  .inputSchema(
    z.object({
      name: z.string().min(1).max(60),
      color: colorSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { id } = await createTagForUser(ctx.user.uid, parsedInput);
    revalidatePath("/tags");
    revalidatePath("/cards");
    return { id };
  });

export const renameTagAction = authedAction
  .inputSchema(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(60),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await renameTagForUser(ctx.user.uid, parsedInput.id, parsedInput.name);
    revalidatePath("/tags");
    revalidatePath("/cards");
    return result;
  });

export const recolorTagAction = authedAction
  .inputSchema(
    z.object({
      id: z.string().min(1),
      color: z.enum(paletteOklch),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await recolorTagForUser(ctx.user.uid, parsedInput.id, parsedInput.color);
    revalidatePath("/tags");
    return { ok: true as const };
  });

export const deleteTagAction = authedAction
  .inputSchema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await deleteTagForUser(ctx.user.uid, parsedInput.id);
    revalidatePath("/tags");
    revalidatePath("/cards");
    return result;
  });
