import { describe, it, expect } from "vitest";
import { parseCsvText } from "../parse";

describe("parseCsvText", () => {
  it("1. returns headers + rows from a simple CSV", () => {
    const csv = "Name,Email\nAlice,alice@example.com\nBob,bob@example.com";
    const { headers, rows } = parseCsvText(csv);
    expect(headers).toEqual(["Name", "Email"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["Alice", "alice@example.com"]);
  });

  it("2. strips UTF-8 BOM (U+FEFF)", () => {
    const csv = "\uFEFFFirst Name,Last Name\nJohn,Doe";
    const { headers } = parseCsvText(csv);
    expect(headers[0]).toBe("First Name");
  });

  it("3. handles quoted comma inside cell", () => {
    const csv = `Name,Company\nAlice,"Acme, Inc."`;
    const { rows } = parseCsvText(csv);
    expect(rows[0][1]).toBe("Acme, Inc.");
  });

  it("4. handles escaped double-quote inside quoted field", () => {
    const csv = `Name,Notes\nAlice,"She said ""hello"""`;
    const { rows } = parseCsvText(csv);
    expect(rows[0][1]).toBe('She said "hello"');
  });

  it("5. CRLF line endings are handled correctly", () => {
    const csv = "A,B\r\n1,2\r\n3,4";
    const { headers, rows } = parseCsvText(csv);
    expect(headers).toEqual(["A", "B"]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["3", "4"]);
  });

  it("6. empty rows (all blank cells) are dropped", () => {
    const csv = "A,B\n1,2\n  ,  \n3,4";
    const { rows } = parseCsvText(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["1", "2"]);
    expect(rows[1]).toEqual(["3", "4"]);
  });

  it("7. cells are trimmed of surrounding whitespace", () => {
    const csv = "  Name  ,  Email  \n  Alice  ,  alice@example.com  ";
    const { headers, rows } = parseCsvText(csv);
    expect(headers).toEqual(["Name", "Email"]);
    expect(rows[0]).toEqual(["Alice", "alice@example.com"]);
  });

  it("8. empty string input returns empty headers and rows", () => {
    const { headers, rows } = parseCsvText("");
    expect(headers).toEqual([]);
    expect(rows).toEqual([]);
  });
});
