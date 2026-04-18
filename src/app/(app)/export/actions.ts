"use server";

import { z } from "zod";

import { listCardsForUser } from "@/db/cards";
import { authedAction } from "@/lib/auth/safe-action";
import { getAdminStorage } from "@/lib/firebase/server";
import { buildCardsZip } from "@/lib/export/zip";

const MAX_CARDS = 500;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export interface ExportScope {
  scope: "all" | "ids";
  cardIds?: string[];
}

export interface ExportResponse {
  /** base64-encoded zip buffer */
  zipBase64: string;
  cardCount: number;
  imageCount: number;
  bytes: number;
  filename: string;
}

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchImageFromStorage(path: string): Promise<Buffer | null> {
  try {
    const [buf] = await getAdminStorage().bucket().file(path).download();
    return buf;
  } catch {
    return null;
  }
}

export const exportCardsAction = authedAction
  .inputSchema(
    z.object({
      scope: z.enum(["all", "ids"]),
      cardIds: z.array(z.string().min(1)).max(500).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }): Promise<ExportResponse> => {
    const uid = ctx.user.uid;
    const allCards = await listCardsForUser(uid, { limit: MAX_CARDS });

    const cards =
      parsedInput.scope === "ids" && parsedInput.cardIds
        ? allCards.filter((c) => parsedInput.cardIds!.includes(c.id))
        : allCards;

    if (cards.length > MAX_CARDS) {
      throw new Error("一次最多匯出 500 張，請先用標籤或搜尋縮小範圍。");
    }

    const result = await buildCardsZip({ cards, fetchImage: fetchImageFromStorage });

    if (result.bytes > MAX_BYTES) {
      throw new Error("匯出檔 >50MB，請縮小範圍再試。");
    }

    return {
      zipBase64: result.buffer.toString("base64"),
      cardCount: result.cardCount,
      imageCount: result.imageCount,
      bytes: result.bytes,
      filename: `namecard-export-${todayString()}.zip`,
    };
  });
