import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { MobileFab } from "../MobileFab";

describe("MobileFab follow-up integration", () => {
  it("renders the closed FAB with no badge by default", () => {
    render(<MobileFab />);
    expect(screen.getByLabelText("打開快速動作")).toBeInTheDocument();
    expect(screen.queryByLabelText(/個人該 ping 了/)).toBeNull();
  });

  it("renders the count badge on the closed FAB when followupsTotal > 0", () => {
    render(<MobileFab followupsTotal={5} />);
    const badge = screen.getByLabelText("5 個人該 ping 了");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("5");
  });

  it("hides the badge once the FAB is open (sheet shown instead)", () => {
    render(<MobileFab followupsTotal={3} />);
    fireEvent.click(screen.getByLabelText("打開快速動作"));
    expect(screen.queryByLabelText("3 個人該 ping 了")).toBeNull();
  });

  it("includes ⏰ 追蹤 (N 個) sheet action when followupsTotal > 0", () => {
    render(<MobileFab followupsTotal={4} />);
    fireEvent.click(screen.getByLabelText("打開快速動作"));
    const link = screen.getByText(/⏰ 追蹤 \(4 個\)/).closest("a");
    expect(link?.getAttribute("href")).toBe("/followups");
  });

  it("does NOT include ⏰ 追蹤 in the sheet when followupsTotal is 0", () => {
    render(<MobileFab followupsTotal={0} />);
    fireEvent.click(screen.getByLabelText("打開快速動作"));
    expect(screen.queryByText(/⏰ 追蹤/)).toBeNull();
  });
});
