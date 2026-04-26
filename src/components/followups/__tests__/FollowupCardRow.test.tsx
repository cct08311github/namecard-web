import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { CardSummary } from "@/db/cards";
import { FollowupCardRow } from "../FollowupCardRow";

vi.mock("@/app/(app)/cards/actions", () => ({
  logContactAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function makeCard(overrides: Partial<CardSummary> = {}): CardSummary {
  return {
    id: "c1",
    nameZh: "王大明",
    emails: [{ value: "wang@example.com", primary: true, label: "工作" }],
    phones: [{ value: "0922000111", primary: true, label: "手機" }],
    social: { lineId: "wangda" },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lastContactedAt: null,
    ...overrides,
  } as CardSummary;
}

describe("FollowupCardRow quick contact links", () => {
  it("renders mailto when primary email present", () => {
    render(<FollowupCardRow card={makeCard()} days={42} />);
    const link = screen.getByLabelText(/寄信給 王大明/) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("mailto:wang@example.com");
  });

  it("renders tel when primary phone present", () => {
    render(<FollowupCardRow card={makeCard()} days={42} />);
    const link = screen.getByLabelText(/撥電話給 王大明/) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("tel:0922000111");
  });

  it("renders LINE deep link when lineId present", () => {
    render(<FollowupCardRow card={makeCard()} days={42} />);
    const link = screen.getByLabelText(/LINE 聯絡 王大明/) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://line.me/R/ti/p/~wangda");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("hides each quick action when corresponding field is missing", () => {
    render(
      <FollowupCardRow card={makeCard({ emails: [], phones: [], social: undefined })} days={3} />,
    );
    expect(screen.queryByLabelText(/寄信給/)).toBeNull();
    expect(screen.queryByLabelText(/撥電話給/)).toBeNull();
    expect(screen.queryByLabelText(/LINE 聯絡/)).toBeNull();
  });

  it("encodes special chars in lineId so the URL stays valid", () => {
    render(<FollowupCardRow card={makeCard({ social: { lineId: "wang/da" } })} days={1} />);
    const link = screen.getByLabelText(/LINE 聯絡/) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://line.me/R/ti/p/~wang%2Fda");
  });
});
