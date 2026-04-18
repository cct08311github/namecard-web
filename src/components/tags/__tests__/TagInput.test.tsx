import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TagInput, type TagOption } from "../TagInput";

// Server action stub — returns a predictable id so "create new tag" is testable.
vi.mock("@/app/(app)/tags/actions", () => ({
  createTagAction: vi.fn(async ({ name }: { name: string }) => ({
    data: { id: `new-${name}` },
  })),
}));

const { createTagAction } = await import("@/app/(app)/tags/actions");

const OPTIONS: TagOption[] = [
  { id: "t-ai", name: "AI", color: "oklch(62% 0.14 35)" },
  { id: "t-biz", name: "business dev" },
  { id: "t-半導體", name: "半導體" },
];

describe("TagInput", () => {
  beforeEach(() => {
    vi.mocked(createTagAction).mockClear();
  });

  it("renders chips for existing value", () => {
    render(
      <TagInput value={["t-ai"]} nameValue={["AI"]} onChange={() => {}} initialOptions={OPTIONS} />,
    );
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("filters suggestions as user types", async () => {
    const user = userEvent.setup();
    render(<TagInput value={[]} nameValue={[]} onChange={() => {}} initialOptions={OPTIONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "半");
    expect(await screen.findByText("半導體")).toBeInTheDocument();
    expect(screen.queryByText("AI")).not.toBeInTheDocument();
  });

  it("selecting an existing tag adds to both parallel arrays", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TagInput value={[]} nameValue={[]} onChange={onChange} initialOptions={OPTIONS} />);
    await user.click(screen.getByRole("combobox"));
    // Listbox option
    const aiOption = await screen.findByRole("button", { name: "AI" });
    fireEvent.mouseDown(aiOption);
    expect(onChange).toHaveBeenCalledWith(["t-ai"], ["AI"]);
  });

  it("Enter with no match triggers createTagAction and appends result", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TagInput value={[]} nameValue={[]} onChange={onChange} initialOptions={OPTIONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "冷門標籤{Enter}");

    // Wait for the action to resolve + setState.
    await vi.waitFor(() => {
      expect(createTagAction).toHaveBeenCalledWith({ name: "冷門標籤" });
      expect(onChange).toHaveBeenCalledWith(["new-冷門標籤"], ["冷門標籤"]);
    });
  });

  it("deduplicates when user picks an already-selected option", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TagInput value={["t-ai"]} nameValue={["AI"]} onChange={onChange} initialOptions={OPTIONS} />,
    );
    await user.click(screen.getByRole("combobox"));
    // The "AI" chip is rendered but not as a listbox option (filtered out).
    expect(screen.queryByRole("button", { name: "AI" })).not.toBeInTheDocument();
  });

  it("Backspace on empty input removes the last chip", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TagInput
        value={["t-ai", "t-biz"]}
        nameValue={["AI", "business dev"]}
        onChange={onChange}
        initialOptions={OPTIONS}
      />,
    );
    const input = screen.getByRole("combobox");
    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(onChange).toHaveBeenCalledWith(["t-ai"], ["AI"]);
  });

  it("clicking the × on a chip removes that chip", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TagInput
        value={["t-ai", "t-biz"]}
        nameValue={["AI", "business dev"]}
        onChange={onChange}
        initialOptions={OPTIONS}
      />,
    );
    await user.click(screen.getByLabelText("Remove AI"));
    expect(onChange).toHaveBeenCalledWith(["t-biz"], ["business dev"]);
  });
});
