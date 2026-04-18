/**
 * Component tests for ExportButton.
 *
 * Strategy: mock exportCardsAction so we test client-side behavior
 * (pending state, download trigger, error display) without hitting
 * the server.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Must mock before importing the component.
vi.mock("@/app/(app)/export/actions", () => ({
  exportCardsAction: vi.fn(),
}));

import { exportCardsAction } from "@/app/(app)/export/actions";
import { ExportButton } from "../ExportButton";

const mockAction = exportCardsAction as ReturnType<typeof vi.fn>;

// Minimal base64 of a tiny valid ZIP (just two bytes so Uint8Array works).
const FAKE_B64 = btoa("PK");

describe("ExportButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Stub URL.createObjectURL / revokeObjectURL (not available in jsdom).
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("triggers download anchor on success", async () => {
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "a") {
        vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(clickSpy);
      }
      return el;
    });

    mockAction.mockResolvedValueOnce({
      data: {
        zipBase64: FAKE_B64,
        cardCount: 2,
        imageCount: 0,
        bytes: 2,
        filename: "namecard-export-2026-01-01.zip",
      },
    });

    render(<ExportButton />);
    await userEvent.click(screen.getByRole("button", { name: "匯出" }));

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  it("renders error alert on serverError", async () => {
    mockAction.mockResolvedValueOnce({
      serverError: "一次最多匯出 500 張，請先用標籤或搜尋縮小範圍。",
    });

    render(<ExportButton />);
    await userEvent.click(screen.getByRole("button", { name: "匯出" }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeTruthy();
      expect(alert.textContent).toContain("500");
    });
  });
});
