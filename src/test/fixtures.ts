import type { CardCreateInput, CardUpdateInput } from "@/db/schema";

export const TEST_UID_ALICE = "alice-uid";
export const TEST_UID_BOB = "bob-uid";
export const TEST_EMAIL_ALICE = "alice@example.com";
export const TEST_EMAIL_BOB = "bob@example.com";

/**
 * Minimal-valid CardCreateInput. Every TDD test should override only what it
 * is actually asserting on; the rest stays deterministic.
 */
export function aCard(overrides: Partial<CardCreateInput> = {}): CardCreateInput {
  return {
    nameZh: "陳志明",
    nameEn: "Alice Chen",
    namePhonetic: undefined,
    jobTitleZh: "產品經理",
    jobTitleEn: "Product Manager",
    department: undefined,
    companyZh: "某某科技",
    companyEn: "ACME Tech",
    companyWebsite: undefined,
    phones: [{ label: "mobile", value: "+886-912-345-678" }],
    emails: [{ label: "work", value: "alice@acme.example" }],
    addresses: [],
    social: {},
    whyRemember: "2024 COMPUTEX 攤位聊到邊緣 AI 推論。",
    firstMetDate: undefined,
    firstMetContext: undefined,
    firstMetEventTag: undefined,
    notes: undefined,
    tagIds: [],
    tagNames: [],
    frontImagePath: undefined,
    backImagePath: undefined,
    ocrProvider: undefined,
    ocrConfidence: undefined,
    ocrRawJson: undefined,
    ...overrides,
  };
}

export function aCardUpdate(overrides: CardUpdateInput = {}): CardUpdateInput {
  return {
    whyRemember: "上週見過面，補記憶。",
    ...overrides,
  };
}
