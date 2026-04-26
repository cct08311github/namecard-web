import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { TagSummary } from "@/db/tags";
import { TagsClient } from "../TagsClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("../actions", () => ({
  createTagAction: vi.fn(),
  deleteTagAction: vi.fn(),
  recolorTagAction: vi.fn(),
  renameTagAction: vi.fn(),
}));

function tag(id: string, name: string): TagSummary {
  return { id, name, color: "#888888", createdAt: null };
}

const tags: TagSummary[] = [
  tag("t-acme", "ACME 客戶"),
  tag("t-ces", "CES 2024"),
  tag("t-comp", "COMPUTEX 2025"),
  tag("t-vc", "VC 投資人"),
];

describe("TagsClient filter", () => {
  it("renders all tags by default", () => {
    render(<TagsClient tags={tags} />);
    expect(screen.getByDisplayValue("ACME 客戶")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CES 2024")).toBeInTheDocument();
    expect(screen.getByDisplayValue("COMPUTEX 2025")).toBeInTheDocument();
  });

  it("filters by case-insensitive substring on tag name", () => {
    render(<TagsClient tags={tags} />);
    fireEvent.change(screen.getByLabelText("搜尋標籤"), { target: { value: "ces" } });
    expect(screen.getByDisplayValue("CES 2024")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("ACME 客戶")).toBeNull();
    expect(screen.queryByDisplayValue("COMPUTEX 2025")).toBeNull();
  });

  it("shows '沒有符合' message when nothing matches", () => {
    render(<TagsClient tags={tags} />);
    fireEvent.change(screen.getByLabelText("搜尋標籤"), { target: { value: "xyz" } });
    expect(screen.getByText(/沒有符合「xyz」/)).toBeInTheDocument();
  });

  it("displays filtered/total count when filter is active", () => {
    render(<TagsClient tags={tags} />);
    fireEvent.change(screen.getByLabelText("搜尋標籤"), { target: { value: "20" } });
    // 'CES 2024' and 'COMPUTEX 2025' both contain '20'
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
  });

  it("does not render the filter row when there are no tags at all", () => {
    render(<TagsClient tags={[]} />);
    expect(screen.queryByLabelText("搜尋標籤")).toBeNull();
    expect(screen.getByText(/還沒有標籤/)).toBeInTheDocument();
  });
});
