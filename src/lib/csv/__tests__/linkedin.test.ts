import { describe, it, expect } from "vitest";
import { detectLinkedInFormat } from "../linkedin";

// ---------------------------------------------------------------------------
// Fixture header rows
// ---------------------------------------------------------------------------

const APRIL_2024_HEADERS = "First Name,Last Name,Email Address,Company,Position,Connected On";

const OCT_2024_HEADERS =
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On,Notes";

const GENERIC_HEADERS = "name,email,phone,org";

function splitHeaders(raw: string): string[] {
  return raw.split(",");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectLinkedInFormat", () => {
  it("1. April 2024 LinkedIn export → confidence >= 0.7", () => {
    const { confidence } = detectLinkedInFormat(splitHeaders(APRIL_2024_HEADERS));
    expect(confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("2. Oct 2024 LinkedIn variant → confidence >= 0.7", () => {
    const { confidence } = detectLinkedInFormat(splitHeaders(OCT_2024_HEADERS));
    expect(confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("3. Generic CSV → confidence < 0.7", () => {
    const { confidence } = detectLinkedInFormat(splitHeaders(GENERIC_HEADERS));
    expect(confidence).toBeLessThan(0.7);
  });

  it("4. April 2024 column map has expected canonical fields", () => {
    const { columns } = detectLinkedInFormat(splitHeaders(APRIL_2024_HEADERS));
    expect(columns["First Name"]).toBe("firstName");
    expect(columns["Last Name"]).toBe("lastName");
    expect(columns["Email Address"]).toBe("emailWork");
    expect(columns["Company"]).toBe("companyEn");
    expect(columns["Position"]).toBe("jobTitleEn");
    expect(columns["Connected On"]).toBe("firstMetDate");
  });

  it("5. Oct 2024 Notes column mapped to notes", () => {
    const { columns } = detectLinkedInFormat(splitHeaders(OCT_2024_HEADERS));
    expect(columns["Notes"]).toBe("notes");
  });

  it("6. URL column mapped to ignored", () => {
    const { columns } = detectLinkedInFormat(splitHeaders(OCT_2024_HEADERS));
    expect(columns["URL"]).toBe("ignored");
  });

  it("7. Case-insensitive: all-lowercase headers still detected", () => {
    const lowerHeaders = splitHeaders(APRIL_2024_HEADERS.toLowerCase());
    const { confidence, columns } = detectLinkedInFormat(lowerHeaders);
    expect(confidence).toBeGreaterThanOrEqual(0.7);
    expect(columns["first name"]).toBe("firstName");
    expect(columns["last name"]).toBe("lastName");
  });

  it("8. Extra whitespace in header still detected (trimmed by parseCsvText)", () => {
    // Simulate headers already trimmed by parseCsvText.
    const headers = [
      "First Name",
      "Last Name",
      "Email Address",
      "Company",
      "Position",
      "Connected On",
    ];
    const { confidence } = detectLinkedInFormat(headers);
    expect(confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("9. Unknown headers default to ignored", () => {
    const { columns } = detectLinkedInFormat(["RandomField", "AnotherField"]);
    expect(columns["RandomField"]).toBe("ignored");
    expect(columns["AnotherField"]).toBe("ignored");
  });
});
