import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CompanyList, type CompanyListItem } from "../CompanyList";

const items: CompanyListItem[] = [
  {
    slug: "acme",
    displayName: "Acme Inc",
    count: 5,
    mostRecentTouchYmd: "2026/04/27",
    followupCount: 2,
  },
  {
    slug: "beta",
    displayName: "Beta Labs",
    count: 3,
    mostRecentTouchYmd: "2026/04/20",
    followupCount: 0,
  },
  {
    slug: "global-foo",
    displayName: "Global Foo",
    count: 1,
    mostRecentTouchYmd: "—",
    followupCount: 0,
  },
];

describe("CompanyList filter", () => {
  it("renders all items by default", () => {
    render(<CompanyList items={items} />);
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByText("Beta Labs")).toBeInTheDocument();
    expect(screen.getByText("Global Foo")).toBeInTheDocument();
  });

  it("filters by case-insensitive substring", () => {
    render(<CompanyList items={items} />);
    fireEvent.change(screen.getByLabelText("搜尋公司"), { target: { value: "ACM" } });
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.queryByText("Beta Labs")).toBeNull();
    expect(screen.queryByText("Global Foo")).toBeNull();
  });

  it("shows '沒有符合' message when nothing matches", () => {
    render(<CompanyList items={items} />);
    fireEvent.change(screen.getByLabelText("搜尋公司"), { target: { value: "xyz" } });
    expect(screen.getByText(/沒有符合「xyz」/)).toBeInTheDocument();
  });

  it("shows the filtered/total count when filter is active", () => {
    render(<CompanyList items={items} />);
    fireEvent.change(screen.getByLabelText("搜尋公司"), { target: { value: "a" } });
    // 'Acme', 'Beta Labs', 'Global Foo' — the first two contain 'a' (case-insensitive)
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("renders ⏰ N badge only on rows with followupCount > 0", () => {
    render(<CompanyList items={items} />);
    expect(screen.getByLabelText("2 個人該 ping 了")).toBeInTheDocument();
    // Only one badge in the list
    expect(screen.getAllByLabelText(/個人該 ping 了/)).toHaveLength(1);
  });

  it("each row has a link to /companies/{slug}", () => {
    render(<CompanyList items={items} />);
    const link = screen.getByText("Acme Inc").closest("a");
    expect(link?.getAttribute("href")).toBe("/companies/acme");
  });
});
