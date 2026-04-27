import { describe, expect, it } from "vitest";

import { googleCalendarEventUrl } from "../gcal-url";

describe("googleCalendarEventUrl", () => {
  it("encodes title + dates for an all-day event", () => {
    const url = googleCalendarEventUrl({
      title: "跟陳玉涵 ping 一下",
      dateYmd: "2026-05-01",
    });
    expect(url).toContain("calendar.google.com/calendar/render");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260501%2F20260502"); // start / end (exclusive)
    // Chinese characters URL-encoded in title
    expect(url).toMatch(/text=%E8%B7%9F.*ping/);
  });

  it("includes details when provided", () => {
    const url = googleCalendarEventUrl({
      title: "test",
      dateYmd: "2026-05-01",
      details: "上次談到 Q3 計畫",
    });
    expect(url).toContain("details=");
    expect(url).toMatch(/details=.*Q3/);
  });

  it("omits details when not provided", () => {
    const url = googleCalendarEventUrl({
      title: "test",
      dateYmd: "2026-05-01",
    });
    expect(url).not.toContain("details=");
  });

  it("crosses month boundary for end date", () => {
    const url = googleCalendarEventUrl({
      title: "test",
      dateYmd: "2026-04-30",
    });
    expect(url).toContain("dates=20260430%2F20260501");
  });

  it("crosses year boundary for end date", () => {
    const url = googleCalendarEventUrl({
      title: "test",
      dateYmd: "2026-12-31",
    });
    expect(url).toContain("dates=20261231%2F20270101");
  });

  it("handles malformed input gracefully (returns same compact string for both)", () => {
    // Defensive: garbage in, garbage-but-not-crash out.
    const url = googleCalendarEventUrl({
      title: "test",
      dateYmd: "garbage",
    });
    expect(url).toContain("dates=garbage%2Fgarbage");
  });
});
