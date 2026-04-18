"use server";

import { z } from "zod";

import { listTagsForUser } from "@/db/tags";
import { authedAction } from "@/lib/auth/safe-action";
import { cardCreateSchema } from "@/db/schema";
import { suggestTags } from "@/lib/tags/suggest";

export const suggestTagsAction = authedAction
  .inputSchema(
    z.object({
      cardDraft: cardCreateSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const existingTags = await listTagsForUser(ctx.user.uid);
    const result = await suggestTags(parsedInput.cardDraft, {
      existingTagNames: existingTags.map((t) => t.name),
    });
    return result;
  });
