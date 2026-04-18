"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { inviteMemberByEmail, removeMember, transferOwnership } from "@/db/members";
import { authedAction } from "@/lib/auth/safe-action";
import { personalWorkspaceId } from "@/lib/firebase/shared";

export const inviteMemberAction = authedAction
  .inputSchema(z.object({ email: z.string().email() }))
  .action(async ({ parsedInput, ctx }) => {
    const wid = personalWorkspaceId(ctx.user.uid);
    const result = await inviteMemberByEmail(wid, ctx.user.uid, parsedInput.email);
    revalidatePath("/workspace/members");
    revalidatePath("/");
    revalidatePath("/cards");
    return result;
  });

export const removeMemberAction = authedAction
  .inputSchema(z.object({ targetUid: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const wid = personalWorkspaceId(ctx.user.uid);
    const result = await removeMember(wid, ctx.user.uid, parsedInput.targetUid);
    revalidatePath("/workspace/members");
    revalidatePath("/");
    revalidatePath("/cards");
    return result;
  });

export const transferOwnerAction = authedAction
  .inputSchema(z.object({ newOwnerUid: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const wid = personalWorkspaceId(ctx.user.uid);
    const result = await transferOwnership(wid, ctx.user.uid, parsedInput.newOwnerUid);
    revalidatePath("/workspace/members");
    return result;
  });
