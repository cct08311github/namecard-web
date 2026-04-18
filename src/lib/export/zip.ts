import "server-only";

import JSZip from "jszip";

import type { CardSummary } from "@/db/cards";
import { toVcard } from "@/lib/vcard/export";

export interface ExportImageFetcher {
  (path: string): Promise<Buffer | null>;
}

export interface BuildZipInput {
  cards: CardSummary[];
  fetchImage: ExportImageFetcher;
}

export interface BuildZipResult {
  buffer: Buffer;
  cardCount: number;
  imageCount: number;
  bytes: number;
}

const UNSAFE_CHARS = /[/\\:*?"<>|]/g;
const WHITESPACE_RUN = /\s+/g;

function sanitizeFilename(name: string): string {
  return name.replace(UNSAFE_CHARS, "").replace(WHITESPACE_RUN, " ").trim().slice(0, 80);
}

function safeBaseName(card: CardSummary): string {
  const raw = card.nameZh ?? card.nameEn ?? card.id;
  const clean = sanitizeFilename(raw);
  return clean.length > 0 ? clean : card.id;
}

function extFromPath(storagePath: string, fallback = ".webp"): string {
  const last = storagePath.split(".").pop();
  if (!last || last === storagePath) return fallback;
  return `.${last}`;
}

export async function buildCardsZip(input: BuildZipInput): Promise<BuildZipResult> {
  const { cards, fetchImage } = input;
  const zip = new JSZip();

  const usedVcfNames = new Set<string>();
  let imageCount = 0;

  for (const card of cards) {
    // ---- vCard ----
    const baseName = safeBaseName(card);
    let vcfName = `${baseName}.vcf`;
    if (usedVcfNames.has(vcfName)) {
      let counter = 2;
      while (usedVcfNames.has(`${baseName}-${counter}.vcf`)) counter++;
      vcfName = `${baseName}-${counter}.vcf`;
    }
    usedVcfNames.add(vcfName);
    zip.file(`vcards/${vcfName}`, toVcard(card));

    // ---- images ----
    const imagePaths: Array<{ storagePath: string; side: "front" | "back" }> = [];
    if (card.frontImagePath) imagePaths.push({ storagePath: card.frontImagePath, side: "front" });
    if (card.backImagePath) imagePaths.push({ storagePath: card.backImagePath, side: "back" });

    for (const { storagePath, side } of imagePaths) {
      try {
        const buf = await fetchImage(storagePath);
        if (buf === null) continue;
        const ext = extFromPath(storagePath);
        zip.file(`images/${card.id}-${side}${ext}`, buf);
        imageCount++;
      } catch {
        // silent skip — tolerance per spec
      }
    }
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  return {
    buffer,
    cardCount: cards.length,
    imageCount,
    bytes: buffer.byteLength,
  };
}
