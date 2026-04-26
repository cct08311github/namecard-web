import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { OnboardingHero } from "../OnboardingHero";

describe("OnboardingHero", () => {
  it("renders all four capture-path cards in business-user-priority order", () => {
    render(<OnboardingHero />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    // Order matters: scan (paper-card instinct after event) > voice > new > import.
    // If this changes, update the audit report rationale too.
    expect(hrefs).toEqual(["/cards/scan", "/cards/voice", "/cards/new", "/import"]);
  });

  it("emphasizes the first path (scan)", () => {
    render(<OnboardingHero />);
    const scanLink = screen.getAllByRole("link")[0]!;
    // The emphasis variant is conveyed by class — assert by checking the
    // distinct class differs from non-emphasis siblings.
    const voiceLink = screen.getAllByRole("link")[1]!;
    expect(scanLink.className).not.toBe(voiceLink.className);
  });
});
