import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { QuickSearchPalette } from "../QuickSearchPalette";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

const searchMock = vi.fn();
vi.mock("@/app/(app)/cards/search-actions", () => ({
  searchCardsAction: (...args: unknown[]) => searchMock(...args),
}));

function flushDebounceAndPromises() {
  // 140ms debounce + 1 microtask flush.
  return act(async () => {
    await new Promise((r) => setTimeout(r, 200));
  });
}

describe("QuickSearchPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<QuickSearchPalette open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with search input + hint when opened with empty query", () => {
    render(<QuickSearchPalette open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: /搜尋名片/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/搜尋名片/)).toBeInTheDocument();
    expect(screen.getByText(/開始輸入即時搜尋/)).toBeInTheDocument();
  });

  it("calls searchCardsAction (debounced) and renders hits", async () => {
    searchMock.mockResolvedValueOnce({
      data: {
        hits: [
          {
            id: "card-1",
            nameZh: "陳玉涵",
            companyZh: "智威科技",
            whyRemember: "Computex 攤位",
            highlights: {},
          },
          {
            id: "card-2",
            nameEn: "Alice",
            companyEn: "ACME",
            whyRemember: "Coffee chat",
            highlights: {},
          },
        ],
        found: 2,
        searchTimeMs: 12,
        degraded: false,
      },
    });
    render(<QuickSearchPalette open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/搜尋名片/), { target: { value: "智威" } });
    await flushDebounceAndPromises();

    expect(searchMock).toHaveBeenCalledWith({ q: "智威", limit: 8 });
    expect(screen.getByText("陳玉涵")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("智威科技")).toBeInTheDocument();
  });

  it("Enter on highlighted hit pushes /cards/[id] and closes", async () => {
    pushMock.mockClear();
    const onClose = vi.fn();
    searchMock.mockResolvedValueOnce({
      data: {
        hits: [
          {
            id: "abc",
            nameZh: "陳玉涵",
            companyZh: "智威",
            whyRemember: "x",
            highlights: {},
          },
        ],
        found: 1,
        searchTimeMs: 5,
        degraded: false,
      },
    });
    render(<QuickSearchPalette open onClose={onClose} />);
    const input = screen.getByPlaceholderText(/搜尋名片/);
    fireEvent.change(input, { target: { value: "陳" } });
    await flushDebounceAndPromises();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(pushMock).toHaveBeenCalledWith("/cards/abc");
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc on input closes the palette", () => {
    const onClose = vi.fn();
    render(<QuickSearchPalette open onClose={onClose} />);
    fireEvent.keyDown(screen.getByPlaceholderText(/搜尋名片/), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("ArrowDown / ArrowUp moves the selected option", async () => {
    searchMock.mockResolvedValueOnce({
      data: {
        hits: [
          { id: "a", nameZh: "A", highlights: {} },
          { id: "b", nameZh: "B", highlights: {} },
          { id: "c", nameZh: "C", highlights: {} },
        ],
        found: 3,
        searchTimeMs: 1,
        degraded: false,
      },
    });
    render(<QuickSearchPalette open onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/搜尋名片/);
    fireEvent.change(input, { target: { value: "x" } });
    await flushDebounceAndPromises();

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
    // Down past the end stays on last.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  });

  it("shows degraded message when search action returns degraded=true", async () => {
    searchMock.mockResolvedValueOnce({
      data: { hits: [], found: 0, searchTimeMs: 0, degraded: true },
    });
    render(<QuickSearchPalette open onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/搜尋名片/), { target: { value: "x" } });
    await flushDebounceAndPromises();
    expect(screen.getByText(/搜尋服務暫時不可用/)).toBeInTheDocument();
  });
});
