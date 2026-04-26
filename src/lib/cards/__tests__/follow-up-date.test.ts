import { describe, expect, it } from "vitest";

import { localYmdAfterDays } from "../follow-up-date";

describe("localYmdAfterDays", () => {
  // Use mid-day local times so DST shifts and TZ offsets can't roll the
  // calendar day either direction.
  const apr26noon = new Date(2026, 3, 26, 12, 0, 0);

  it("returns the same day when days=0", () => {
    expect(localYmdAfterDays(0, apr26noon)).toBe("2026-04-26");
  });

  it("adds 7 days for 1 week", () => {
    expect(localYmdAfterDays(7, apr26noon)).toBe("2026-05-03");
  });

  it("crosses month boundary", () => {
    const apr29 = new Date(2026, 3, 29, 12, 0, 0);
    expect(localYmdAfterDays(7, apr29)).toBe("2026-05-06");
  });

  it("crosses year boundary", () => {
    const dec28 = new Date(2026, 11, 28, 12, 0, 0);
    expect(localYmdAfterDays(7, dec28)).toBe("2027-01-04");
  });

  it("zero-pads single-digit months and days", () => {
    const jan2 = new Date(2026, 0, 2, 12, 0, 0);
    expect(localYmdAfterDays(0, jan2)).toBe("2026-01-02");
  });

  it("handles 90 days (3 months) correctly", () => {
    expect(localYmdAfterDays(90, apr26noon)).toBe("2026-07-25");
  });
});
