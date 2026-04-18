import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAllowedEmails, isEmailAllowed } from "@/lib/auth/allowed-emails";

describe("allowed-emails helpers", () => {
  const originalEnv = process.env.ALLOWED_EMAILS;

  beforeEach(() => {
    delete process.env.ALLOWED_EMAILS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOWED_EMAILS = originalEnv;
    } else {
      delete process.env.ALLOWED_EMAILS;
    }
  });

  it("returns empty set when ALLOWED_EMAILS is unset", () => {
    expect(getAllowedEmails().size).toBe(0);
  });

  it("returns empty set when ALLOWED_EMAILS is an empty string", () => {
    process.env.ALLOWED_EMAILS = "";
    expect(getAllowedEmails().size).toBe(0);
  });

  it("parses a single email", () => {
    process.env.ALLOWED_EMAILS = "alice@example.com";
    expect(getAllowedEmails().has("alice@example.com")).toBe(true);
  });

  it("parses multiple emails separated by commas", () => {
    process.env.ALLOWED_EMAILS = "alice@example.com,bob@example.com";
    const set = getAllowedEmails();
    expect(set.has("alice@example.com")).toBe(true);
    expect(set.has("bob@example.com")).toBe(true);
  });

  it("trims whitespace around emails", () => {
    process.env.ALLOWED_EMAILS = " alice@example.com , bob@example.com ";
    const set = getAllowedEmails();
    expect(set.has("alice@example.com")).toBe(true);
    expect(set.has("bob@example.com")).toBe(true);
  });

  it("lowercases emails for comparison", () => {
    process.env.ALLOWED_EMAILS = "Alice@Example.COM";
    expect(getAllowedEmails().has("alice@example.com")).toBe(true);
  });

  it("isEmailAllowed returns true for an allowed email (case-insensitive)", () => {
    process.env.ALLOWED_EMAILS = "alice@example.com";
    expect(isEmailAllowed("Alice@Example.COM")).toBe(true);
  });

  it("isEmailAllowed returns false when email is not in the list", () => {
    process.env.ALLOWED_EMAILS = "alice@example.com";
    expect(isEmailAllowed("charlie@example.com")).toBe(false);
  });

  it("isEmailAllowed returns false when ALLOWED_EMAILS is empty", () => {
    expect(isEmailAllowed("alice@example.com")).toBe(false);
  });

  it("isEmailAllowed trims input email before matching", () => {
    process.env.ALLOWED_EMAILS = "alice@example.com";
    expect(isEmailAllowed("  alice@example.com  ")).toBe(true);
  });
});
