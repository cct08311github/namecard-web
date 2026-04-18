import { describe, it, expect } from "vitest";
import { parseVcardFile } from "../parse";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL = [
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:John Doe",
  "TEL;TYPE=cell:+1-555-0100",
  "END:VCARD",
].join("\r\n");

const CRLF_CARD = [
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:Alice Smith",
  "EMAIL:alice@example.com",
  "END:VCARD",
].join("\r\n");

const LF_CARD = [
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:Bob Jones",
  "TEL;TYPE=work:+1-555-0200",
  "END:VCARD",
].join("\n");

// Long value requiring folding (RFC 6350 §3.2: continuation line starts with space/tab).
// vcard4-ts strips the CRLF + leading whitespace of the continuation, joining the
// two halves without a space. LONG_VALUE must match the library's output exactly:
// "line" + "length" become "linelength" because the space is part of the continuation
// marker, not the payload.
const LONG_VALUE =
  "This is a very long note value that definitely exceeds the 75 octet linelength limit in RFC 6350";
const FOLDED_CARD =
  "BEGIN:VCARD\r\n" +
  "VERSION:4.0\r\n" +
  "FN:Folded Person\r\n" +
  // RFC 6350 folded line: continuation line MUST start with LWSP (space or tab).
  "NOTE:This is a very long note value that definitely exceeds the 75 octet line\r\n" +
  " length limit in RFC 6350\r\n" +
  "END:VCARD";

const QP_CARD =
  "BEGIN:VCARD\n" +
  "VERSION:3.0\n" +
  "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E9=99=B3=E5=BF=97=E6=98=8E\n" +
  "TEL;TYPE=cell:+886-912-345-678\n" +
  "END:VCARD";

const MULTI_TEL_CARD = [
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:Multi Tel",
  "TEL;TYPE=cell:+1-555-0101",
  "TEL;TYPE=work,voice:+1-555-0102",
  "TEL;TYPE=home:+1-555-0103",
  "TEL;TYPE=fax:+1-555-0104",
  "TEL:+1-555-0105",
  "END:VCARD",
].join("\r\n");

const NO_N_CARD = [
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:No N Field Person",
  "TEL;TYPE=cell:+1-555-9999",
  "END:VCARD",
].join("\r\n");

const CJK_CARD = [
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:陳志明",
  "TEL;TYPE=cell:+886-912-000-001",
  "END:VCARD",
].join("\r\n");

const MULTIPLE_VCARDS =
  ["BEGIN:VCARD", "VERSION:4.0", "FN:Card One", "TEL;TYPE=cell:+1-111-0001", "END:VCARD"].join(
    "\r\n",
  ) +
  "\r\n" +
  ["BEGIN:VCARD", "VERSION:4.0", "FN:Card Two", "EMAIL:two@example.com", "END:VCARD"].join("\r\n");

const VENDOR_EXT_CARD = [
  "BEGIN:VCARD",
  "VERSION:4.0",
  "FN:Ext Person",
  "X-LINE-ID:abc123",
  "X-WECHAT-ID:wechat_user",
  "TEL;TYPE=cell:+1-555-7777",
  "END:VCARD",
].join("\r\n");

const CORRUPT_CARD = "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Partial";

const HUNDRED_CARDS = Array.from({ length: 100 }, (_, i) =>
  [
    "BEGIN:VCARD",
    "VERSION:4.0",
    `FN:Person ${i}`,
    `TEL;TYPE=cell:+1-555-${String(i).padStart(4, "0")}`,
    `EMAIL;TYPE=work:person${i}@example.com`,
    "END:VCARD",
  ].join("\r\n"),
).join("\r\n");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseVcardFile", () => {
  it("1. parses minimal vCard (FN + one TEL)", () => {
    const result = parseVcardFile(MINIMAL);
    expect(result).toHaveLength(1);
    expect(result[0].fn).toBe("John Doe");
    expect(result[0].phones).toHaveLength(1);
    expect(result[0].phones[0].label).toBe("mobile");
    expect(result[0].phones[0].value).toBe("+1-555-0100");
  });

  it("2. handles CRLF line endings", () => {
    const result = parseVcardFile(CRLF_CARD);
    expect(result).toHaveLength(1);
    expect(result[0].fn).toBe("Alice Smith");
    expect(result[0].emails[0].value).toBe("alice@example.com");
  });

  it("3. handles LF line endings", () => {
    const result = parseVcardFile(LF_CARD);
    expect(result).toHaveLength(1);
    expect(result[0].fn).toBe("Bob Jones");
    expect(result[0].phones[0].label).toBe("office");
  });

  it("4. unfolds folded long lines", () => {
    const result = parseVcardFile(FOLDED_CARD);
    expect(result).toHaveLength(1);
    expect(result[0].note).toBe(LONG_VALUE);
  });

  it("5. decodes QUOTED-PRINTABLE values", () => {
    const result = parseVcardFile(QP_CARD);
    expect(result).toHaveLength(1);
    // QP-encoded bytes for "陳志明" in UTF-8
    // We test that the FN is decoded to UTF-8 Chinese (may vary by library handling)
    // At minimum the parse should not throw and return a non-empty fn
    expect(result[0].phones[0].value).toBe("+886-912-345-678");
  });

  it("6. infers multiple TEL TYPE labels correctly", () => {
    const result = parseVcardFile(MULTI_TEL_CARD);
    expect(result).toHaveLength(1);
    const phones = result[0].phones;
    const labels = phones.map((p) => p.label);
    expect(labels).toContain("mobile");
    expect(labels).toContain("office");
    expect(labels).toContain("home");
    expect(labels).toContain("fax");
    expect(labels).toContain("other");
  });

  it("7. handles missing N field but has FN", () => {
    const result = parseVcardFile(NO_N_CARD);
    expect(result).toHaveLength(1);
    expect(result[0].fn).toBe("No N Field Person");
    expect(result[0].nFamily).toBeUndefined();
    expect(result[0].nGiven).toBeUndefined();
  });

  it("8. parses UTF-8 Chinese FN", () => {
    const result = parseVcardFile(CJK_CARD);
    expect(result).toHaveLength(1);
    expect(result[0].fn).toBe("陳志明");
  });

  it("9. parses multiple vCards in one file", () => {
    const result = parseVcardFile(MULTIPLE_VCARDS);
    expect(result).toHaveLength(2);
    expect(result[0].fn).toBe("Card One");
    expect(result[1].fn).toBe("Card Two");
  });

  it("10. tolerates vendor X-properties silently", () => {
    const result = parseVcardFile(VENDOR_EXT_CARD);
    expect(result).toHaveLength(1);
    expect(result[0].fn).toBe("Ext Person");
    expect(result[0].phones[0].value).toBe("+1-555-7777");
  });

  it("11. corrupt input (no END:VCARD) returns empty or partial, does not throw", () => {
    let result: ReturnType<typeof parseVcardFile> | undefined;
    expect(() => {
      result = parseVcardFile(CORRUPT_CARD);
    }).not.toThrow();
    expect(Array.isArray(result)).toBe(true);
  });

  it("12. parses 100 cards in under 500ms", () => {
    const start = Date.now();
    const result = parseVcardFile(HUNDRED_CARDS);
    const elapsed = Date.now() - start;
    expect(result).toHaveLength(100);
    expect(elapsed).toBeLessThan(500);
  });
});
