import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { CardSummary } from "@/db/cards";
import type { TimelineSection } from "@/lib/timeline/categorize";
import { UncontactedSection } from "../UncontactedSection";

vi.mock("@/app/(app)/cards/actions", () => ({
  logContactAction: vi.fn(),
  setFollowUpAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Fixed reference: 2026-04-26 12:00 local
const NOW = new Date(2026, 3, 26, 12, 0, 0);

function makeCard(overrides: Partial<CardSummary> = {}): CardSummary {
  const createdAt = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
  return {
    id: "c1",
    nameZh: "陳小華",
    emails: [{ value: "chen@example.com", primary: true, label: "work" as const }],
    phones: [{ value: "0933111222", primary: true, label: "mobile" as const }],
    social: {},
    whyRemember: "台大同學",
    tagIds: [],
    tagNames: [],
    memberUids: ["uid1"],
    ownerUid: "uid1",
    workspaceId: "wid1",
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    lastContactedAt: null,
    ...overrides,
  } as CardSummary;
}

function makeSection(cards: CardSummary[]): TimelineSection {
  return {
    id: "uncontacted",
    title: "最近沒聯絡",
    description: "已經 30 天以上沒互動，可能該問候一下。",
    cards,
  };
}

describe("UncontactedSection", () => {
  it("renders nothing when section is empty", () => {
    const { container } = render(<UncontactedSection section={makeSection([])} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders section heading with correct title", () => {
    render(<UncontactedSection section={makeSection([makeCard()])} now={NOW} />);
    expect(screen.getByRole("heading", { name: "最近沒聯絡" })).toBeInTheDocument();
  });

  it("renders FollowupCardRow with mail/phone quick actions", () => {
    render(<UncontactedSection section={makeSection([makeCard()])} now={NOW} />);
    expect(screen.getByLabelText(/寄信給 陳小華/)).toBeInTheDocument();
    expect(screen.getByLabelText(/撥電話給 陳小華/)).toBeInTheDocument();
  });

  it("shows ✅ 已聯絡 button for each uncontacted card", () => {
    render(<UncontactedSection section={makeSection([makeCard()])} now={NOW} />);
    expect(screen.getByLabelText(/標記已聯絡 陳小華/)).toBeInTheDocument();
    expect(screen.getByText("✅ 已聯絡")).toBeInTheDocument();
  });

  it("shows staleness label with days since last contact", () => {
    // lastContactedAt null — falls back to createdAt (40 days ago)
    render(<UncontactedSection section={makeSection([makeCard()])} now={NOW} />);
    // Should show something like "40 天沒聯絡"
    expect(screen.getByText(/天沒聯絡/)).toBeInTheDocument();
  });

  it("shows LINE quick action when lineId is set", () => {
    const card = makeCard({ social: { lineId: "chenhw123" } });
    render(<UncontactedSection section={makeSection([card])} now={NOW} />);
    expect(screen.getByLabelText(/LINE 聯絡 陳小華/)).toBeInTheDocument();
  });

  it("renders multiple cards as separate rows", () => {
    const cards = [
      makeCard({ id: "c1", nameZh: "陳小華" }),
      makeCard({
        id: "c2",
        nameZh: "李大偉",
        emails: [{ value: "li@example.com", primary: true, label: "work" as const }],
        phones: [],
      }),
    ];
    render(<UncontactedSection section={makeSection(cards)} now={NOW} />);
    expect(screen.getByLabelText(/標記已聯絡 陳小華/)).toBeInTheDocument();
    expect(screen.getByLabelText(/標記已聯絡 李大偉/)).toBeInTheDocument();
  });

  it("uses lastContactedAt over createdAt for staleness when available", () => {
    // lastContactedAt = 35 days ago
    const lastContactedAt = new Date(NOW.getTime() - 35 * 24 * 60 * 60 * 1000);
    const card = makeCard({ lastContactedAt });
    render(<UncontactedSection section={makeSection([card])} now={NOW} />);
    expect(screen.getByText("35 天沒聯絡")).toBeInTheDocument();
  });
});
