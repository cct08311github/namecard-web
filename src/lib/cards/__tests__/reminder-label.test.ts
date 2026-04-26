import { describe, expect, it } from "vitest";

import { reminderDateLabel } from "../reminder-label";

describe("reminderDateLabel", () => {
  it("returns 今天 for same-day reminder (any time)", () => {
    const today = new Date(2026, 3, 26, 12, 0, 0);
    const reminder = new Date(2026, 3, 26, 9, 0, 0);
    expect(reminderDateLabel(reminder, today)).toBe("今天");
  });

  it("returns 今天 for past reminder (overdue surfaces under today)", () => {
    const today = new Date(2026, 3, 26, 9, 0, 0);
    const reminder = new Date(2026, 3, 20, 9, 0, 0);
    expect(reminderDateLabel(reminder, today)).toBe("今天");
  });

  it("returns 明天 for next-day reminder regardless of clock time", () => {
    const today = new Date(2026, 3, 26, 23, 0, 0);
    const tomorrowMorning = new Date(2026, 3, 27, 9, 0, 0);
    const tomorrowNight = new Date(2026, 3, 27, 23, 30, 0);
    expect(reminderDateLabel(tomorrowMorning, today)).toBe("明天");
    expect(reminderDateLabel(tomorrowNight, today)).toBe("明天");
  });

  it("returns M/D for ≥2 days out", () => {
    const today = new Date(2026, 3, 26, 12, 0, 0);
    const future = new Date(2026, 3, 30, 12, 0, 0);
    expect(reminderDateLabel(future, today)).toBe("4/30");
  });

  it("month/day printed without leading zeros", () => {
    const today = new Date(2026, 3, 26, 12, 0, 0);
    const future = new Date(2026, 4, 3, 12, 0, 0); // May 3
    expect(reminderDateLabel(future, today)).toBe("5/3");
  });

  it("crosses month boundary cleanly", () => {
    const apr29 = new Date(2026, 3, 29, 12, 0, 0);
    const may2 = new Date(2026, 4, 2, 12, 0, 0);
    expect(reminderDateLabel(may2, apr29)).toBe("5/2");
  });
});
