import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { InlineEditField } from "../InlineEditField";

function setup(overrides: Partial<Parameters<typeof InlineEditField>[0]> = {}) {
  const onSave = overrides.onSave ?? vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <InlineEditField
      value="Initial"
      onSave={onSave}
      placeholder="placeholder"
      ariaLabel="名稱"
      {...overrides}
    />,
  );
  return { onSave, ...utils };
}

describe("InlineEditField", () => {
  it("renders the value as a clickable button by default", () => {
    setup();
    expect(screen.getByRole("button", { name: /Initial/ })).toBeInTheDocument();
  });

  it("renders placeholder when value is empty", () => {
    setup({ value: undefined });
    expect(screen.getByRole("button", { name: /placeholder/ })).toBeInTheDocument();
  });

  it("clicking the display swaps to an input with the current value", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Initial/ }));
    const input = screen.getByLabelText("名稱") as HTMLInputElement;
    expect(input.value).toBe("Initial");
  });

  it("Enter commits the new value via onSave", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    setup({ onSave });
    fireEvent.click(screen.getByRole("button", { name: /Initial/ }));
    const input = screen.getByLabelText("名稱") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith("Renamed"));
  });

  it("blur commits the value (matches click-outside UX)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    setup({ onSave });
    fireEvent.click(screen.getByRole("button", { name: /Initial/ }));
    const input = screen.getByLabelText("名稱") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Blurred" } });
    fireEvent.blur(input);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith("Blurred"));
  });

  it("Escape cancels without calling onSave", async () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.click(screen.getByRole("button", { name: /Initial/ }));
    const input = screen.getByLabelText("名稱") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSave).not.toHaveBeenCalled();
    // Restored display.
    expect(screen.getByRole("button", { name: /Initial/ })).toBeInTheDocument();
  });

  it("does NOT call onSave when value is unchanged (trim-equal)", async () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.click(screen.getByRole("button", { name: /Initial/ }));
    const input = screen.getByLabelText("名稱") as HTMLInputElement;
    // Add trailing whitespace — trim should match original.
    fireEvent.change(input, { target: { value: "Initial  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows error message when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("network kaboom"));
    setup({ onSave });
    fireEvent.click(screen.getByRole("button", { name: /Initial/ }));
    const input = screen.getByLabelText("名稱") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Renamed" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("network kaboom");
    // Stays in editing mode so the user can retry.
    expect(screen.getByLabelText("名稱")).toBeInTheDocument();
  });

  it("respects maxLength on the input", () => {
    setup({ maxLength: 5 });
    fireEvent.click(screen.getByRole("button", { name: /Initial/ }));
    const input = screen.getByLabelText("名稱") as HTMLInputElement;
    expect(input.maxLength).toBe(5);
  });

  it("multiline mode renders a textarea and Cmd+Enter commits", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    setup({ multiline: true, onSave });
    fireEvent.click(screen.getByRole("button", { name: /Initial/ }));
    const textarea = screen.getByLabelText("名稱") as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");
    fireEvent.change(textarea, { target: { value: "line1\nline2" } });
    // Plain Enter should NOT commit in multiline mode.
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    // Cmd+Enter commits.
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith("line1\nline2"));
  });

  it("disabled prop hides the pencil + skips edit mode", () => {
    setup({ disabled: true });
    // No button role — just plain text.
    expect(screen.queryByRole("button")).toBeNull();
  });
});
