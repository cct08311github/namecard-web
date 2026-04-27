import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { SessionUser } from "@/lib/firebase/session";
import { AppShell } from "../AppShell";

// Mock the client-only sub-components — we're testing AppShell's own
// rendering decisions (badge logic), not the children.
vi.mock("@/components/search/SearchBox", () => ({
  SearchBox: () => <div data-testid="searchbox" />,
}));
vi.mock("../GlobalShortcuts", () => ({
  GlobalShortcuts: () => null,
}));
vi.mock("../MobileFab", () => ({
  MobileFab: () => null,
}));
vi.mock("../MobileNavWrapper", () => ({
  MobileNavWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/app/(auth)/login/actions", () => ({
  signOutAction: vi.fn(),
}));

const user: SessionUser = {
  uid: "u",
  email: "u@example.com",
  displayName: "User",
};

describe("AppShell follow-up badge", () => {
  it("does not render the badge when followupsTotal is 0", () => {
    render(
      <AppShell user={user} followupsTotal={0}>
        body
      </AppShell>,
    );
    expect(screen.queryByLabelText(/個人該 ping 了/)).toBeNull();
  });

  it("renders the badge with count when followupsTotal > 0", () => {
    render(
      <AppShell user={user} followupsTotal={7}>
        body
      </AppShell>,
    );
    const badge = screen.getByLabelText("7 個人該 ping 了");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("7");
  });

  it("badge appears in the 「追蹤」 nav link, not other entries", () => {
    render(
      <AppShell user={user} followupsTotal={3}>
        body
      </AppShell>,
    );
    const badge = screen.getByLabelText("3 個人該 ping 了");
    // Walk up to find nearest link with href /followups
    const link = badge.closest("a");
    expect(link?.getAttribute("href")).toBe("/followups");
  });

  it("defaults to 0 (no badge) when prop omitted", () => {
    render(<AppShell user={user}>body</AppShell>);
    expect(screen.queryByLabelText(/個人該 ping 了/)).toBeNull();
  });

  it("PRIMARY rail includes 拍照建檔 link to /cards/scan", () => {
    render(<AppShell user={user}>body</AppShell>);
    const link = screen.getByText(/拍照建檔/).closest("a");
    expect(link?.getAttribute("href")).toBe("/cards/scan");
  });

  it("rail is grouped into 4 sections (行動/捕捉/回顧/設定)", () => {
    render(<AppShell user={user}>body</AppShell>);
    expect(screen.getByText("行動")).toBeInTheDocument();
    expect(screen.getByText("捕捉")).toBeInTheDocument();
    expect(screen.getByText("回顧")).toBeInTheDocument();
    expect(screen.getByText("設定")).toBeInTheDocument();
  });
});
