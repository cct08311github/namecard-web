import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { MobileNavWrapper } from "../MobileNavWrapper";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cards",
}));

function renderWrapper() {
  // Test fixtures use unrouted hrefs to dodge Next's no-html-link-for-pages
  // lint — the click-to-close behavior we're testing only checks
  // closest("a"), not actual navigation.
  return render(
    <MobileNavWrapper>
      <aside aria-label="Primary navigation">
        <a href="#cards">名片冊</a>
        <a href="#companies">公司</a>
      </aside>
    </MobileNavWrapper>,
  );
}

describe("MobileNavWrapper", () => {
  it("renders hamburger button with closed aria-expanded by default", () => {
    renderWrapper();
    const toggle = screen.getByRole("button", { name: /開啟選單/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking the toggle opens the drawer", () => {
    renderWrapper();
    fireEvent.click(screen.getByRole("button", { name: /開啟選單/ }));
    const closer = screen.getByRole("button", { name: /關閉選單/ });
    expect(closer).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("mobile-nav-overlay")).toBeInTheDocument();
  });

  it("clicking the overlay closes the drawer", () => {
    renderWrapper();
    fireEvent.click(screen.getByRole("button", { name: /開啟選單/ }));
    fireEvent.click(screen.getByTestId("mobile-nav-overlay"));
    expect(screen.getByRole("button", { name: /開啟選單/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("Esc closes the drawer when open", () => {
    renderWrapper();
    fireEvent.click(screen.getByRole("button", { name: /開啟選單/ }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: /開啟選單/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("clicking a nav link inside the drawer auto-closes it", () => {
    renderWrapper();
    fireEvent.click(screen.getByRole("button", { name: /開啟選單/ }));
    fireEvent.click(screen.getByText("名片冊"));
    expect(screen.getByRole("button", { name: /開啟選單/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("locks body scroll while open and restores on close", () => {
    renderWrapper();
    expect(document.body.style.overflow).not.toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: /開啟選單/ }));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
