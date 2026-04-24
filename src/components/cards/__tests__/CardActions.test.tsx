import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CardActions } from "../CardActions";

// Stub the Server Actions — this unit test is purely about render state,
// not the mutation path (SIT covers that).
vi.mock("@/app/(app)/cards/actions", () => ({
  deleteCardAction: vi.fn(),
  logContactAction: vi.fn().mockResolvedValue({ ok: true, eventId: "ev1" }),
  toggleCardPinAction: vi.fn().mockResolvedValue({ ok: true, pinned: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("CardActions quick CTA row", () => {
  it("renders the mark-contacted button even without any contact fields", () => {
    render(<CardActions cardId="abc" />);
    expect(screen.getByRole("button", { name: /記錄為已聯絡/ })).toBeInTheDocument();
    // Quick row always renders 4 slots (Phone / Email / LINE / Already contacted).
    // Without contact data, the first 3 are rendered as disabled span stubs.
    expect(screen.getAllByText("電話")).toHaveLength(1);
    expect(screen.getAllByText("Email")).toHaveLength(1);
    expect(screen.getAllByText("LINE")).toHaveLength(1);
  });

  it("emits tel: deep link when primaryPhone is provided", () => {
    render(<CardActions cardId="abc" primaryPhone="0928030326" />);
    const phoneLink = screen.getByLabelText("撥打 0928030326") as HTMLAnchorElement;
    expect(phoneLink.href).toBe("tel:0928030326");
  });

  it("emits mailto: deep link when primaryEmail is provided", () => {
    render(<CardActions cardId="abc" primaryEmail="x@y.com" />);
    const mailLink = screen.getByLabelText("寄信到 x@y.com") as HTMLAnchorElement;
    expect(mailLink.href).toBe("mailto:x@y.com");
  });

  it("builds LINE deep link with @ prefix for official LINE IDs", () => {
    render(<CardActions cardId="abc" lineId="@openclaw" />);
    const lineLink = screen.getByLabelText("開啟 LINE") as HTMLAnchorElement;
    expect(lineLink.href).toContain("line.me/ti/p/");
    expect(lineLink.href).toContain(encodeURIComponent("@openclaw"));
  });

  it("builds LINE deep link with ~ prefix for user IDs without @", () => {
    render(<CardActions cardId="abc" lineId="yuhan" />);
    const lineLink = screen.getByLabelText("開啟 LINE") as HTMLAnchorElement;
    expect(lineLink.href).toContain("line.me/ti/p/~yuhan");
  });

  it("renders LinkedIn button only when URL is present", () => {
    const { rerender } = render(<CardActions cardId="abc" />);
    expect(screen.queryByText(/開啟 LinkedIn/)).not.toBeInTheDocument();
    rerender(<CardActions cardId="abc" linkedinUrl="https://linkedin.com/in/x" />);
    const linkedinLink = screen.getByText(/開啟 LinkedIn/) as HTMLAnchorElement;
    expect(linkedinLink.closest("a")?.href).toBe("https://linkedin.com/in/x");
  });

  it("renders copy-row only when at least one of phone/email exists", () => {
    const { rerender } = render(<CardActions cardId="abc" />);
    expect(screen.queryByText("複製 Email")).not.toBeInTheDocument();
    expect(screen.queryByText("複製電話")).not.toBeInTheDocument();
    rerender(<CardActions cardId="abc" primaryEmail="x@y.com" />);
    expect(screen.getByText("複製 Email")).toBeInTheDocument();
    expect(screen.queryByText("複製電話")).not.toBeInTheDocument();
  });

  describe("contact-event note flow", () => {
    it("first click on 已聯絡 expands the note input (doesn't fire the action)", () => {
      render(<CardActions cardId="abc" />);
      expect(screen.queryByLabelText(/互動備註/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /記錄為已聯絡/ }));
      expect(screen.getByLabelText(/互動備註/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /記錄為已聯絡/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });

    it("cancel button closes the note input without submitting", () => {
      render(<CardActions cardId="abc" />);
      fireEvent.click(screen.getByRole("button", { name: /記錄為已聯絡/ }));
      expect(screen.getByLabelText(/互動備註/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /取消/ }));
      expect(screen.queryByLabelText(/互動備註/)).not.toBeInTheDocument();
    });

    it("typing a note and clicking 記錄 submits the trimmed value", async () => {
      const { logContactAction } = await import("@/app/(app)/cards/actions");
      render(<CardActions cardId="abc" />);
      fireEvent.click(screen.getByRole("button", { name: /記錄為已聯絡/ }));
      const textarea = screen.getByLabelText(/互動備註/) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "wrote follow-up email" } });
      fireEvent.click(screen.getByRole("button", { name: /記錄為已聯絡/ }));
      await vi.waitFor(() => {
        expect(logContactAction).toHaveBeenCalledWith({
          id: "abc",
          note: "wrote follow-up email",
        });
      });
    });
  });

  describe("pin toggle", () => {
    it("shows 設為重要聯絡人 when unpinned and 已置頂 when pinned", () => {
      const { rerender } = render(<CardActions cardId="abc" />);
      expect(screen.getByText(/設為重要聯絡人/)).toBeInTheDocument();
      rerender(<CardActions cardId="abc" isPinned />);
      expect(screen.getByText(/已置頂/)).toBeInTheDocument();
    });

    it("fires toggleCardPinAction with opposite pinned value", async () => {
      const { toggleCardPinAction } = await import("@/app/(app)/cards/actions");
      const mocked = vi.mocked(toggleCardPinAction);
      mocked.mockClear();
      render(<CardActions cardId="abc" isPinned={false} />);
      fireEvent.click(screen.getByText(/設為重要聯絡人/));
      await vi.waitFor(() => {
        expect(mocked).toHaveBeenCalledWith({ id: "abc", pinned: true });
      });
    });
  });
});
