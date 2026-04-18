import JSZip from "jszip";
import { describe, it, expect, vi } from "vitest";

import type { CardSummary } from "@/db/cards";
import { buildCardsZip } from "../zip";

function makeCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "card-1",
    workspaceId: "ws-1",
    ownerUid: "uid-1",
    memberUids: ["uid-1"],
    nameZh: "王小明",
    nameEn: undefined,
    namePhonetic: undefined,
    companyZh: undefined,
    companyEn: undefined,
    jobTitleZh: undefined,
    jobTitleEn: undefined,
    department: undefined,
    whyRemember: "",
    firstMetDate: undefined,
    firstMetContext: undefined,
    firstMetEventTag: undefined,
    notes: undefined,
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    social: {},
    frontImagePath: undefined,
    backImagePath: undefined,
    createdAt: null,
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const noopFetcher = vi.fn(async () => null as Buffer | null);

describe("buildCardsZip", () => {
  it("1. empty cards → empty zip (no vcf files)", async () => {
    const result = await buildCardsZip({ cards: [], fetchImage: noopFetcher });
    expect(result.cardCount).toBe(0);
    expect(result.imageCount).toBe(0);

    const zip = await JSZip.loadAsync(result.buffer);
    // JSZip includes directory entries; filter them out (they end with "/")
    const vcfFiles = Object.keys(zip.files).filter(
      (k) => k.startsWith("vcards/") && !k.endsWith("/"),
    );
    expect(vcfFiles).toHaveLength(0);
  });

  it("2. single card, no images → one vcf, no image files", async () => {
    const card = makeCard();
    const result = await buildCardsZip({ cards: [card], fetchImage: noopFetcher });
    expect(result.cardCount).toBe(1);
    expect(result.imageCount).toBe(0);

    const zip = await JSZip.loadAsync(result.buffer);
    const vcfFiles = Object.keys(zip.files).filter((k) => k.endsWith(".vcf"));
    expect(vcfFiles).toHaveLength(1);
    expect(vcfFiles[0]).toBe("vcards/王小明.vcf");

    const imageFiles = Object.keys(zip.files).filter(
      (k) => k.startsWith("images/") && !k.endsWith("/"),
    );
    expect(imageFiles).toHaveLength(0);
  });

  it("3. card with frontImagePath → front image present", async () => {
    const card = makeCard({
      id: "abc",
      frontImagePath: "users/uid-1/card-images/front.webp",
    });
    const imageBuffer = Buffer.from("fake-image-bytes");
    const fetcher = vi.fn(async () => imageBuffer);

    const result = await buildCardsZip({ cards: [card], fetchImage: fetcher });
    expect(result.imageCount).toBe(1);

    const zip = await JSZip.loadAsync(result.buffer);
    const imageFiles = Object.keys(zip.files).filter(
      (k) => k.startsWith("images/") && !k.endsWith("/"),
    );
    expect(imageFiles).toHaveLength(1);
    expect(imageFiles[0]).toBe("images/abc-front.webp");
  });

  it("4. card with front and back → both images present", async () => {
    const card = makeCard({
      id: "xyz",
      frontImagePath: "users/uid-1/card-images/front.webp",
      backImagePath: "users/uid-1/card-images/back.webp",
    });
    const fetcher = vi.fn(async () => Buffer.from("img"));

    const result = await buildCardsZip({ cards: [card], fetchImage: fetcher });
    expect(result.imageCount).toBe(2);

    const zip = await JSZip.loadAsync(result.buffer);
    const imageFiles = Object.keys(zip.files).filter(
      (k) => k.startsWith("images/") && !k.endsWith("/"),
    );
    expect(imageFiles).toHaveLength(2);
    expect(imageFiles).toContain("images/xyz-front.webp");
    expect(imageFiles).toContain("images/xyz-back.webp");
  });

  it("5. filename collision → second card gets -2 suffix", async () => {
    const c1 = makeCard({ id: "c1", nameZh: "陳大文" });
    const c2 = makeCard({ id: "c2", nameZh: "陳大文" });

    const result = await buildCardsZip({ cards: [c1, c2], fetchImage: noopFetcher });

    const zip = await JSZip.loadAsync(result.buffer);
    const vcfFiles = Object.keys(zip.files).filter(
      (k) => k.startsWith("vcards/") && !k.endsWith("/"),
    );
    expect(vcfFiles).toContain("vcards/陳大文.vcf");
    expect(vcfFiles).toContain("vcards/陳大文-2.vcf");
    expect(vcfFiles).toHaveLength(2);
  });

  it("6. image fetcher throws → zip still built, image skipped, vcf intact", async () => {
    const card = makeCard({
      id: "fail",
      frontImagePath: "users/uid-1/card-images/broken.webp",
    });
    const throwingFetcher = vi.fn(async (): Promise<Buffer | null> => {
      throw new Error("storage unavailable");
    });

    const result = await buildCardsZip({ cards: [card], fetchImage: throwingFetcher });
    expect(result.cardCount).toBe(1);
    expect(result.imageCount).toBe(0);

    const zip = await JSZip.loadAsync(result.buffer);
    const vcfFiles = Object.keys(zip.files).filter((k) => k.endsWith(".vcf"));
    expect(vcfFiles).toHaveLength(1);

    const imageFiles = Object.keys(zip.files).filter(
      (k) => k.startsWith("images/") && !k.endsWith("/"),
    );
    expect(imageFiles).toHaveLength(0);
  });

  it("7. filename sanitization strips unsafe chars", async () => {
    const card = makeCard({ id: "s1", nameZh: `A/B\\C:D*E?"F<G>H|I` });
    const result = await buildCardsZip({ cards: [card], fetchImage: noopFetcher });

    const zip = await JSZip.loadAsync(result.buffer);
    const vcfFiles = Object.keys(zip.files).filter((k) => k.endsWith(".vcf"));
    expect(vcfFiles).toHaveLength(1);
    // The path prefix "vcards/" is safe; only check the filename portion
    const filename = vcfFiles[0].replace("vcards/", "");
    // None of the unsafe characters should appear in the filename
    expect(filename).not.toMatch(/[/\\:*?"<>|]/);
  });

  it("8. imageCount reflects successful fetches only", async () => {
    const c1 = makeCard({ id: "ok", frontImagePath: "good.webp" });
    const c2 = makeCard({ id: "bad", frontImagePath: "fail.webp" });

    const fetcher = vi.fn(async (path: string) => {
      if (path === "good.webp") return Buffer.from("img");
      return null;
    });

    const result = await buildCardsZip({ cards: [c1, c2], fetchImage: fetcher });
    expect(result.imageCount).toBe(1);
  });
});
