import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { CardSummary } from "@/db/cards";
import type { TimelineSection } from "@/lib/timeline/categorize";
import { DueTodaySection } from "../DueTodaySection";

vi.mock("@/app/(app)/cards/actions", () => ({
  logContactAction: vi.fn(),
  setFollowUpAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const NOW = new Date(2026, 3, 26, 12, 0, 0);

function makeCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "c1",
    nameZh: "王大明",
    emails: [{ value: "wang@example.com", primary: true, label: "工作" }],
    phones: [{ value: "0922000111", primary: true, label: "手機" }],
    social: {},
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    lastContactedAt: null,
    ...overrides,
  } as CardSummary;
}

describe("DueTodaySection", () => {
  it("renders nothing when section has no cards", () => {
    const { container } = render(
      <DueTodaySection
        section={
          {
            id: "due-today",
            title: "今天該聯絡",
            description: "...",
            cards: [],
          } as TimelineSection
        }
        now={NOW}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders header + actionable rows for each due-today card", () => {
    const card = makeCard();
    render(
      <DueTodaySection
        section={
          {
            id: "due-today",
            title: "今天該聯絡",
            description: "你之前設定提醒到期了。",
            cards: [card],
          } as TimelineSection
        }
        now={NOW}
      />,
    );
    expect(screen.getByRole("heading", { name: "今天該聯絡" })).toBeInTheDocument();
    // FollowupCardRow gives mailto/tel quick actions
    expect(screen.getByLabelText(/寄信給 王大明/)).toBeInTheDocument();
    expect(screen.getByLabelText(/撥電話給 王大明/)).toBeInTheDocument();
    // ✅ 已聯絡 button present
    expect(screen.getByLabelText(/標記已聯絡 王大明/)).toBeInTheDocument();
  });

  it("uses 📅 today label when card has no followUpAt (overdue picked up by section)", () => {
    const card = makeCard({ followUpAt: undefined });
    render(
      <DueTodaySection
        section={
          {
            id: "due-today",
            title: "今天該聯絡",
            description: "...",
            cards: [card],
          } as TimelineSection
        }
        now={NOW}
      />,
    );
    expect(screen.getByText("📅 今天")).toBeInTheDocument();
  });
});
