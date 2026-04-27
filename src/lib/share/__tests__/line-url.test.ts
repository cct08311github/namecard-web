import { describe, expect, it } from "vitest";

import { lineDeepLink } from "../line-url";

describe("lineDeepLink", () => {
  it("returns null for null input", () => {
    expect(lineDeepLink(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(lineDeepLink(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(lineDeepLink("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(lineDeepLink("   ")).toBeNull();
  });

  it("builds @-style public channel link", () => {
    const url = lineDeepLink("@mychannel");
    expect(url).toBe("https://line.me/ti/p/%40mychannel");
  });

  it("builds personal user link without @ prefix", () => {
    const url = lineDeepLink("johndoe123");
    expect(url).toBe("https://line.me/ti/p/~johndoe123");
  });

  it("encodes special characters in personal ID", () => {
    const url = lineDeepLink("john doe");
    expect(url).toBe("https://line.me/ti/p/~john%20doe");
  });

  it("encodes special characters in public ID", () => {
    const url = lineDeepLink("@hello world");
    expect(url).toBe("https://line.me/ti/p/%40hello%20world");
  });

  it("trims surrounding whitespace before checking", () => {
    const url = lineDeepLink("  johndoe  ");
    expect(url).toBe("https://line.me/ti/p/~johndoe");
  });

  it("trims surrounding whitespace for @-style IDs", () => {
    const url = lineDeepLink("  @channel  ");
    expect(url).toBe("https://line.me/ti/p/%40channel");
  });
});
