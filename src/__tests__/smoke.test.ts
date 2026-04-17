import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs vitest correctly", () => {
    expect(1 + 1).toBe(2);
  });

  it("has Node >= 22", () => {
    const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
    expect(major).toBeGreaterThanOrEqual(22);
  });
});
