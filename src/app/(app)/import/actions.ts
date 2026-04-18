"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { batchCreateCardsForUser } from "@/db/cards-batch";
import { cardCreateSchema } from "@/db/schema";
import { authedAction } from "@/lib/auth/safe-action";

export const batchImportCardsAction = authedAction
  .inputSchema(
    z
      .object({
        rows: z.array(cardCreateSchema).max(500),
        decisions: z
          .array(
            z.discriminatedUnion("kind", [
              z.object({ kind: z.literal("create") }),
              z.object({ kind: z.literal("skip") }),
              z.object({ kind: z.literal("merge"), cardId: z.string().min(1) }),
            ]),
          )
          .max(500),
        source: z.enum(["vcard", "csv-linkedin", "csv-generic"]),
      })
      .refine((d) => d.rows.length === d.decisions.length, {
        message: "rows and decisions length must match",
      }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await batchCreateCardsForUser(
      { rows: parsedInput.rows, decisions: parsedInput.decisions },
      { uid: ctx.user.uid },
    );
    revalidatePath("/");
    revalidatePath("/cards");
    return result;
  });
