import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CardCreateInput } from "@/db/schema";

// Mock the server action — runs in client component via import.
vi.mock("@/app/(app)/cards/suggest-tag-actions", () => ({
  suggestTagsAction: vi.fn(),
}));

const { suggestTagsAction } = await import("@/app/(app)/cards/suggest-tag-actions");
const mockAction = vi.mocked(suggestTagsAction);

import { TagSuggestionsPanel } from "../TagSuggestionsPanel";

function makeCard(overrides: Partial<CardCreateInput> = {}): CardCreateInput {
  return {
    phones: [],
    emails: [],
    addresses: [],
    social: {},
    tagIds: [],
    tagNames: [],
    whyRemember: "test",
    ...overrides,
  };
}

const baseProps = {
  cardDraft: makeCard(),
  selectedTagIds: [],
  selectedTagNames: [],
  onApply: vi.fn(),
};

describe("TagSuggestionsPanel", () => {
  it("renders chips when action returns non-empty suggestions", async () => {
    mockAction.mockResolvedValueOnce({
      data: { rules: ["tech"], llm: ["半導體"], merged: ["tech", "半導體"] },
    } as Awaited<ReturnType<typeof suggestTagsAction>>);

    render(<TagSuggestionsPanel {...baseProps} />);

    await waitFor(() => {
      expect(screen.getByText("tech")).toBeInTheDocument();
      expect(screen.getByText("半導體")).toBeInTheDocument();
    });
  });

  it("chip 加入 button calls onApply with the tag name", async () => {
    const onApply = vi.fn();
    mockAction.mockResolvedValueOnce({
      data: { rules: [], llm: ["finance"], merged: ["finance"] },
    } as Awaited<ReturnType<typeof suggestTagsAction>>);

    render(<TagSuggestionsPanel {...baseProps} onApply={onApply} />);

    await waitFor(() => expect(screen.getByText("finance")).toBeInTheDocument());

    const btn = screen.getByRole("button", { name: /加入標籤 finance/i });
    await userEvent.click(btn);

    expect(onApply).toHaveBeenCalledWith("finance");
  });

  it("hides panel when action returns empty arrays", async () => {
    mockAction.mockResolvedValueOnce({
      data: { rules: [], llm: [], merged: [] },
    } as Awaited<ReturnType<typeof suggestTagsAction>>);

    const { container } = render(<TagSuggestionsPanel {...baseProps} />);

    await waitFor(() => {
      // Panel section should not exist when no suggestions.
      expect(container.querySelector("section")).toBeNull();
    });
  });
});
