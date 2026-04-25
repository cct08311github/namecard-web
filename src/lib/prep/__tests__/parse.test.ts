import { describe, expect, it } from "vitest";

import { extractAttendeeNames } from "../parse";

describe("extractAttendeeNames", () => {
  it("returns [] for empty / whitespace input", () => {
    expect(extractAttendeeNames("")).toEqual([]);
    expect(extractAttendeeNames("   ")).toEqual([]);
  });

  it("splits a comma-separated list", () => {
    expect(extractAttendeeNames("Karen Chen, Tom Lee")).toEqual(["Karen Chen", "Tom Lee"]);
  });

  it("handles fullwidth comma 、 and ；", () => {
    expect(extractAttendeeNames("陳玉涵、王小明")).toEqual(["陳玉涵", "王小明"]);
    expect(extractAttendeeNames("陳玉涵；王小明")).toEqual(["陳玉涵", "王小明"]);
  });

  it("splits on 「和」 / 「與」 / 「跟」 connectors", () => {
    expect(extractAttendeeNames("陳玉涵和王小明")).toEqual(["陳玉涵和王小明"]);
    // Connector requires whitespace boundary so we don't slice inside a name
    expect(extractAttendeeNames("陳玉涵 和 王小明")).toEqual(["陳玉涵", "王小明"]);
    expect(extractAttendeeNames("Alice 與 Bob")).toEqual(["Alice", "Bob"]);
    expect(extractAttendeeNames("Alice 跟 Bob")).toEqual(["Alice", "Bob"]);
  });

  it("splits on 'and' / 'with'", () => {
    expect(extractAttendeeNames("Alice and Bob")).toEqual(["Alice", "Bob"]);
    expect(extractAttendeeNames("Alice with Bob")).toEqual(["Alice", "Bob"]);
  });

  it("strips leading time prefix ('明天 3pm:')", () => {
    expect(extractAttendeeNames("明天 3pm: Karen Chen, Tom Lee")).toEqual([
      "Karen Chen",
      "Tom Lee",
    ]);
  });

  it("strips leading 'tomorrow at 3pm' prefix", () => {
    expect(extractAttendeeNames("tomorrow at 3pm: Karen, Tom")).toEqual(["Karen", "Tom"]);
  });

  it("strips leading 跟/與/with after time prefix", () => {
    expect(extractAttendeeNames("明天 跟 Karen, Tom 開會")).toEqual(["Karen", "Tom 開會"]);
  });

  it("strips role tail after 'from' / '@' / 'at' / 「的」", () => {
    expect(extractAttendeeNames("Karen Chen from GreenLeaf")).toEqual(["Karen Chen"]);
    expect(extractAttendeeNames("Karen Chen @ GreenLeaf")).toEqual(["Karen Chen"]);
    expect(extractAttendeeNames("Karen Chen at GreenLeaf")).toEqual(["Karen Chen"]);
    expect(extractAttendeeNames("陳玉涵 的 同事")).toEqual(["陳玉涵"]);
  });

  it("drops too-short tokens (< 2 chars)", () => {
    expect(extractAttendeeNames("A, Karen")).toEqual(["Karen"]);
  });

  it("drops URLs and emails", () => {
    expect(extractAttendeeNames("Karen, https://example.com")).toEqual(["Karen"]);
    expect(extractAttendeeNames("Karen, alice@example.com")).toEqual(["Karen"]);
  });

  it("drops pure numbers / dates", () => {
    expect(extractAttendeeNames("Karen, 2026-04-26")).toEqual(["Karen"]);
    expect(extractAttendeeNames("Karen, 12345")).toEqual(["Karen"]);
  });

  it("drops sentence-like prose tokens", () => {
    expect(extractAttendeeNames("Karen, 我們明天要討論預算的事。")).toEqual(["Karen"]);
  });

  it("dedups case-insensitively, preserving first occurrence", () => {
    expect(extractAttendeeNames("Karen, karen, Tom")).toEqual(["Karen", "Tom"]);
  });

  it("supports newline as a separator", () => {
    expect(extractAttendeeNames("Karen Chen\nTom Lee")).toEqual(["Karen Chen", "Tom Lee"]);
  });

  it("supports + as a separator", () => {
    expect(extractAttendeeNames("Karen + Tom")).toEqual(["Karen", "Tom"]);
  });

  it("handles mixed Chinese + English realistic input", () => {
    expect(
      extractAttendeeNames("明天下午: 陳玉涵, Karen Chen from GreenLeaf, 王小明 with 李大同"),
    ).toEqual(["陳玉涵", "Karen Chen", "王小明", "李大同"]);
  });
});
