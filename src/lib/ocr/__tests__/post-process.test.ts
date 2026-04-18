import { describe, expect, it } from "vitest";

import { detectMalformedEmails, postProcess } from "../post-process";
import type { OcrFields } from "../types";

function base(): OcrFields {
  return { phones: [], emails: [], addresses: [], social: {} };
}

describe("postProcess", () => {
  it("drops fields with empty value", () => {
    const out = postProcess({
      ...base(),
      nameZh: { value: "", confidence: 0.5 },
      nameEn: { value: "Alice", confidence: 0.9 },
    });
    expect(out.nameZh).toBeUndefined();
    expect(out.nameEn?.value).toBe("Alice");
  });

  it("re-labels phone as mobile when prefixed 09XX", () => {
    const out = postProcess({
      ...base(),
      phones: [{ label: "other", value: "0912-345-678", confidence: 0.9 }],
    });
    expect(out.phones[0].label).toBe("mobile");
  });

  it("re-labels phone as mobile from 行動 hint", () => {
    const out = postProcess({
      ...base(),
      phones: [{ label: "other", value: "行動 0800-111", confidence: 0.5 }],
    });
    expect(out.phones[0].label).toBe("mobile");
  });

  it("re-labels 公司 as office", () => {
    const out = postProcess({
      ...base(),
      phones: [{ label: "other", value: "公司 02-2345-6789", confidence: 0.5 }],
    });
    expect(out.phones[0].label).toBe("office");
  });

  it("re-labels fax", () => {
    const out = postProcess({
      ...base(),
      phones: [{ label: "other", value: "FAX 02-1111-2222", confidence: 0.5 }],
    });
    expect(out.phones[0].label).toBe("fax");
  });

  it("trims whitespace in phone and email values", () => {
    const out = postProcess({
      ...base(),
      phones: [{ label: "mobile", value: "  +886 912 345 678  " }],
      emails: [{ label: "work", value: "  ALICE@example.com   " }],
    });
    expect(out.phones[0].value).toBe("+886 912 345 678");
    expect(out.emails[0].value).toBe("ALICE@example.com");
  });

  it("drops emails with empty value", () => {
    const out = postProcess({
      ...base(),
      emails: [
        { label: "work", value: "alice@ex.com" },
        { label: "other", value: "" },
      ],
    });
    expect(out.emails).toHaveLength(1);
  });

  it("is idempotent", () => {
    const input: OcrFields = {
      ...base(),
      nameEn: { value: "Alice", confidence: 0.9 },
      phones: [{ label: "mobile", value: "+886-912-345-678" }],
      emails: [{ label: "work", value: "alice@ex.com" }],
    };
    const first = postProcess(input);
    const second = postProcess(first);
    expect(second).toEqual(first);
  });
});

describe("detectMalformedEmails", () => {
  it("lists emails that don't parse", () => {
    const out = detectMalformedEmails({
      ...base(),
      emails: [
        { label: "work", value: "good@ex.com" },
        { label: "other", value: "bad-email" },
        { label: "other", value: "also@bad" },
      ],
    });
    expect(out).toEqual(["bad-email", "also@bad"]);
  });

  it("returns empty when all emails look valid", () => {
    const out = detectMalformedEmails({
      ...base(),
      emails: [{ label: "work", value: "alice@ex.com" }],
    });
    expect(out).toEqual([]);
  });
});
