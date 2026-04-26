import { describe, expect, it } from "vitest";

import type { CardSummary } from "@/db/cards";

import { collectFormSuggestions } from "../form-suggestions";

function aCard(over: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "c-x",
    workspaceId: "w",
    ownerUid: "u",
    memberUids: ["u"],
    nameZh: "X",
    whyRemember: "x",
    tagIds: [],
    tagNames: [],
    phones: [],
    emails: [],
    createdAt: null,
    updatedAt: null,
    lastContactedAt: null,
    deletedAt: null,
    ...over,
  } as CardSummary;
}

describe("collectFormSuggestions", () => {
  it("returns empty arrays for empty input", () => {
    const out = collectFormSuggestions([]);
    expect(out.companies).toEqual([]);
    expect(out.jobTitles).toEqual([]);
    expect(out.departments).toEqual([]);
    expect(out.events).toEqual([]);
  });

  it("collects unique company / jobTitle / department / event values across cards", () => {
    const cards = [
      aCard({
        id: "1",
        companyZh: "智威",
        companyEn: "Acme",
        jobTitleZh: "PM",
        jobTitleEn: "Product Manager",
        department: "RD",
        firstMetEventTag: "COMPUTEX 2024",
      }),
      aCard({
        id: "2",
        companyZh: "智威",
        companyEn: "Other Corp",
        jobTitleZh: "BD",
        firstMetEventTag: "COMPUTEX 2024",
      }),
    ];
    const out = collectFormSuggestions(cards);
    expect(out.companies?.sort()).toEqual(["Acme", "Other Corp", "智威"]);
    expect(out.jobTitles?.sort()).toEqual(["BD", "PM", "Product Manager"]);
    expect(out.departments).toEqual(["RD"]);
    expect(out.events).toEqual(["COMPUTEX 2024"]);
  });

  it("trims whitespace and skips empty strings", () => {
    const cards = [aCard({ companyZh: "  智威  ", companyEn: "" }), aCard({ companyZh: "智威" })];
    const out = collectFormSuggestions(cards);
    expect(out.companies).toEqual(["智威"]);
  });

  it("excludes deleted cards' values", () => {
    const cards = [
      aCard({ id: "live", companyZh: "智威" }),
      aCard({ id: "deleted", companyZh: "Skip", deletedAt: new Date() }),
    ];
    const out = collectFormSuggestions(cards);
    expect(out.companies).toEqual(["智威"]);
  });

  it("caps each list at 100 entries", () => {
    const cards = Array.from({ length: 200 }, (_, i) =>
      aCard({ id: `c-${i}`, companyZh: `Company ${i}` }),
    );
    const out = collectFormSuggestions(cards);
    expect(out.companies?.length).toBe(100);
  });
});
