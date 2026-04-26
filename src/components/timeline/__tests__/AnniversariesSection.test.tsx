import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { CardSummary } from "@/db/cards";
import type { TimelineSection } from "@/lib/timeline/categorize";
import { AnniversariesSection } from "../AnniversariesSection";

vi.mock("@/app/(app)/cards/actions", () => ({
  logContactAction: vi.fn(),
  setFollowUpAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const NOW = new Date(2026, 3, 27, 12, 0, 0); // April 27 2026

function makeCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "c1",
    nameZh: "王大明",
    emails: [{ value: "wang@example.com", primary: true, label: "工作" }],
    phones: [],
    social: {},
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    lastContactedAt: null,
    ...overrides,
  } as CardSummary;
}

describe("AnniversariesSection", () => {
  it("renders nothing when section has no cards", () => {
    const { container } = render(
      <AnniversariesSection
        section={
          {
            id: "anniversaries",
            title: "🎉 一年前的今天",
            description: "...",
            cards: [],
          } as TimelineSection
        }
        now={NOW}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 「🎉 1 年」 for a card met exactly 1 year ago today", () => {
    const card = makeCard({ id: "a", firstMetDate: "2025-04-27" }); // 1 year ago
    render(
      <AnniversariesSection
        section={
          {
            id: "anniversaries",
            title: "🎉 一年前的今天",
            description: "...",
            cards: [card],
          } as TimelineSection
        }
        now={NOW}
      />,
    );
    expect(screen.getByText("🎉 1 年")).toBeInTheDocument();
    // FollowupCardRow wired up — quick action visible
    expect(screen.getByLabelText(/寄信給 王大明/)).toBeInTheDocument();
  });

  it("renders 「🎉 5 年」 for a 5-year anniversary", () => {
    const card = makeCard({ id: "b", firstMetDate: "2021-04-27" });
    render(
      <AnniversariesSection
        section={
          {
            id: "anniversaries",
            title: "🎉 五 年前的今天",
            description: "...",
            cards: [card],
          } as TimelineSection
        }
        now={NOW}
      />,
    );
    expect(screen.getByText("🎉 5 年")).toBeInTheDocument();
  });

  it("falls back to 1 year if the year lookup misses (defensive)", () => {
    // Card whose firstMetDate doesn't match today — findAnniversariesToday
    // returns no entry, so the Map lookup misses and we fall back.
    const card = makeCard({ id: "c", firstMetDate: "2024-12-15" });
    render(
      <AnniversariesSection
        section={
          {
            id: "anniversaries",
            title: "🎉 週年提醒",
            description: "...",
            cards: [card],
          } as TimelineSection
        }
        now={NOW}
      />,
    );
    expect(screen.getByText("🎉 1 年")).toBeInTheDocument();
  });
});
