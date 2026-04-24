import { describe, expect, it } from "vitest";

import type { OcrFields } from "../types";
import { countAffectedFields, mergeOcrIntoExisting } from "../merge";

function ocr(overrides: Partial<OcrFields> = {}): OcrFields {
  return {
    phones: [],
    emails: [],
    addresses: [],
    social: {},
    ...overrides,
  };
}

describe("mergeOcrIntoExisting — fill-empty (default)", () => {
  it("fills blanks only and leaves existing non-empty fields alone", () => {
    const current = { nameZh: "陳玉涵", jobTitleZh: "" };
    const patch = mergeOcrIntoExisting(
      current,
      ocr({
        nameZh: { value: "陳Override", confidence: 0.9 },
        jobTitleZh: { value: "產品經理", confidence: 0.9 },
        companyZh: { value: "ACME", confidence: 0.8 },
      }),
    );
    // nameZh already filled → untouched; jobTitleZh blank → set; companyZh missing → set.
    expect(patch.nameZh).toBeUndefined();
    expect(patch.jobTitleZh).toBe("產品經理");
    expect(patch.companyZh).toBe("ACME");
  });

  it("fills an empty phones array from OCR", () => {
    const patch = mergeOcrIntoExisting(
      { phones: [] },
      ocr({ phones: [{ label: "mobile", value: "0912345678" }] }),
    );
    expect(patch.phones).toEqual([{ label: "mobile", value: "0912345678" }]);
  });

  it("does NOT touch a phones array that already has entries", () => {
    const patch = mergeOcrIntoExisting(
      { phones: [{ label: "office", value: "02-1234-5678" }] },
      ocr({ phones: [{ label: "mobile", value: "0912345678" }] }),
    );
    expect(patch.phones).toBeUndefined();
  });

  it("fills empty social ids and leaves set ones alone", () => {
    const patch = mergeOcrIntoExisting(
      { social: { lineId: "@existing" } },
      ocr({
        social: {
          lineId: { value: "@new" },
          wechatId: { value: "wc-new" },
        },
      }),
    );
    expect(patch.social?.lineId).toBe("@existing");
    expect(patch.social?.wechatId).toBe("wc-new");
  });

  it("returns an empty patch when OCR provides nothing new", () => {
    const patch = mergeOcrIntoExisting(
      { nameZh: "X", companyZh: "Y" },
      ocr({
        nameZh: { value: "A" },
        companyZh: { value: "B" },
      }),
    );
    expect(Object.keys(patch)).toHaveLength(0);
  });
});

describe("mergeOcrIntoExisting — overwrite", () => {
  it("replaces non-empty fields with OCR values", () => {
    const patch = mergeOcrIntoExisting(
      { nameZh: "舊名", companyZh: "舊公司" },
      ocr({
        nameZh: { value: "新名" },
        companyZh: { value: "新公司" },
      }),
      "overwrite",
    );
    expect(patch.nameZh).toBe("新名");
    expect(patch.companyZh).toBe("新公司");
  });

  it("never wipes a populated field when OCR is silent on it", () => {
    const patch = mergeOcrIntoExisting(
      { nameZh: "保留", companyZh: "保留" },
      ocr({ nameZh: { value: "新" } }),
      "overwrite",
    );
    expect(patch.nameZh).toBe("新");
    expect(patch.companyZh).toBeUndefined();
  });

  it("replaces phones array even when non-empty", () => {
    const patch = mergeOcrIntoExisting(
      { phones: [{ label: "office", value: "02-1" }] },
      ocr({ phones: [{ label: "mobile", value: "0912" }] }),
      "overwrite",
    );
    expect(patch.phones).toEqual([{ label: "mobile", value: "0912" }]);
  });
});

describe("countAffectedFields", () => {
  it("counts fill-empty patches correctly", () => {
    expect(
      countAffectedFields(
        { nameZh: "有", jobTitleZh: "" },
        ocr({
          nameZh: { value: "NEW" },
          jobTitleZh: { value: "PM" },
          companyZh: { value: "ACME" },
        }),
      ),
    ).toBe(2);
  });
});
