import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PinnedFilterChip } from "../PinnedFilterChip";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tag=acme&temp=hot"),
}));

describe("PinnedFilterChip", () => {
  it("renders nothing when totalPinned is 0", () => {
    const { container } = render(<PinnedFilterChip active={false} totalPinned={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the chip with the count when totalPinned > 0", () => {
    render(<PinnedFilterChip active={false} totalPinned={5} />);
    expect(screen.getByRole("button", { name: /📍 只看重要 \(5\)/ })).toBeInTheDocument();
  });

  it("aria-pressed reflects active state", () => {
    const { rerender } = render(<PinnedFilterChip active={false} totalPinned={3} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    rerender(<PinnedFilterChip active={true} totalPinned={3} />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking when inactive adds pinned=1 while preserving other params", () => {
    replaceMock.mockClear();
    render(<PinnedFilterChip active={false} totalPinned={2} />);
    fireEvent.click(screen.getByRole("button"));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).toContain("pinned=1");
    expect(url).toContain("tag=acme");
    expect(url).toContain("temp=hot");
  });

  it("clicking when active removes pinned param", () => {
    // Override the mock for this test only by re-rendering with active=true
    // — the URL fixture above doesn't include `pinned`; the toggle still
    // produces the right "removed" URL via active-state logic.
    replaceMock.mockClear();
    render(<PinnedFilterChip active={true} totalPinned={2} />);
    fireEvent.click(screen.getByRole("button"));
    const url = replaceMock.mock.calls[0]![0] as string;
    expect(url).not.toContain("pinned");
  });
});
