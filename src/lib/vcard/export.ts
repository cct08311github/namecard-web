import type { CardSummary, ContactEvent } from "@/db/cards";

/**
 * Minimal vCard 4.0 generator — handcrafted for reliable iOS / macOS / Google
 * Contacts import. Values are escaped per RFC 6350 §3.4.
 */

export interface ToVcardOptions {
  /**
   * Optional interaction log to append to the NOTE field. Newest events
   * first. Only the first `eventLimit` (default 10) are serialized to
   * keep the vCard readable — older ones still live in Firestore.
   */
  events?: ContactEvent[];
  eventLimit?: number;
}

function formatEventStamp(at: Date): string {
  // Local-time, minute-precision. Keeps the vCard NOTE scannable by
  // humans without dragging timezone machinery into the export.
  const y = at.getFullYear();
  const mo = String(at.getMonth() + 1).padStart(2, "0");
  const d = String(at.getDate()).padStart(2, "0");
  const h = String(at.getHours()).padStart(2, "0");
  const m = String(at.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${m}`;
}

function buildEventBlock(events: ContactEvent[], limit: number): string | null {
  if (!events || events.length === 0) return null;
  const head = events.slice(0, Math.max(1, limit));
  const lines = head.map((e) => {
    const stamp = formatEventStamp(e.at);
    const note = e.note?.trim();
    return note ? `${stamp} - ${note}` : `${stamp} -（無備註）`;
  });
  return `【互動紀錄】\n${lines.join("\n")}`;
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function lineFold(raw: string): string {
  // RFC 6350 §3.2: physical line length ≤ 75 octets (approximate by chars).
  if (raw.length <= 75) return raw;
  const chunks: string[] = [];
  for (let i = 0; i < raw.length; i += 73) {
    chunks.push((i === 0 ? "" : " ") + raw.slice(i, i + 73));
  }
  return chunks.join("\r\n");
}

function joinName(card: CardSummary): string {
  return (
    card.nameZh ||
    card.nameEn ||
    card.namePhonetic ||
    card.companyZh ||
    card.companyEn ||
    "未命名名片"
  );
}

function pushLine(lines: string[], raw: string): void {
  if (!raw) return;
  lines.push(lineFold(raw));
}

function phoneLineType(label: string): string {
  switch (label) {
    case "mobile":
      return "cell";
    case "office":
      return "work,voice";
    case "home":
      return "home,voice";
    case "fax":
      return "work,fax";
    default:
      return "voice";
  }
}

function emailLineType(label: string): string {
  switch (label) {
    case "work":
      return "work";
    case "personal":
      return "home";
    default:
      return "internet";
  }
}

export function toVcard(card: CardSummary, options: ToVcardOptions = {}): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCARD");
  lines.push("VERSION:4.0");

  const fullName = escapeValue(joinName(card));
  pushLine(lines, `FN:${fullName}`);

  // N = Family;Given;Additional;Prefix;Suffix — split nameEn on first space, fall back.
  const nameForN = card.nameEn || card.nameZh || "";
  let familyName = "";
  let givenName = "";
  if (nameForN) {
    const parts = nameForN.trim().split(/\s+/);
    if (parts.length >= 2) {
      givenName = parts.slice(0, -1).join(" ");
      familyName = parts[parts.length - 1];
    } else {
      givenName = parts[0];
    }
  }
  pushLine(lines, `N:${escapeValue(familyName)};${escapeValue(givenName)};;;`);

  const role = card.jobTitleZh || card.jobTitleEn;
  if (role) pushLine(lines, `TITLE:${escapeValue(role)}`);

  const org = card.companyZh || card.companyEn;
  if (org) {
    const department = card.department ? `;${escapeValue(card.department)}` : "";
    pushLine(lines, `ORG:${escapeValue(org)}${department}`);
  }

  for (const phone of card.phones ?? []) {
    if (!phone.value) continue;
    const pref = phone.primary ? ",pref" : "";
    pushLine(lines, `TEL;TYPE=${phoneLineType(phone.label)}${pref}:${escapeValue(phone.value)}`);
  }

  for (const email of card.emails ?? []) {
    if (!email.value) continue;
    const pref = email.primary ? ",pref" : "";
    pushLine(lines, `EMAIL;TYPE=${emailLineType(email.label)}${pref}:${escapeValue(email.value)}`);
  }

  const linkedin = card.social?.linkedinUrl;
  if (linkedin) pushLine(lines, `URL;TYPE=linkedin:${escapeValue(linkedin)}`);
  const website = card.social?.websiteUrl;
  if (website) pushLine(lines, `URL;TYPE=website:${escapeValue(website)}`);

  if (card.firstMetDate) {
    pushLine(lines, `X-FIRST-MET;VALUE=date:${card.firstMetDate.replace(/-/g, "")}`);
  }
  if (card.firstMetEventTag) {
    pushLine(lines, `CATEGORIES:${escapeValue(card.firstMetEventTag)}`);
  }

  const noteParts: string[] = [];
  if (card.whyRemember) noteParts.push(`【為什麼記得】${card.whyRemember}`);
  if (card.firstMetContext) noteParts.push(`【場合】${card.firstMetContext}`);
  if (card.notes) noteParts.push(card.notes);
  const eventBlock = buildEventBlock(options.events ?? [], options.eventLimit ?? 10);
  if (eventBlock) noteParts.push(eventBlock);
  if (noteParts.length > 0) {
    pushLine(lines, `NOTE:${escapeValue(noteParts.join("\n\n"))}`);
  }

  pushLine(lines, `REV:${new Date().toISOString()}`);
  lines.push("END:VCARD");

  return lines.join("\r\n") + "\r\n";
}

export function vcardFilename(card: CardSummary): string {
  const base = card.nameEn || card.nameZh || "contact";
  // Replace filesystem-unfriendly chars.
  const safe = base.replace(/[^A-Za-z0-9_\-\u3400-\u9fff]+/g, "_").slice(0, 80);
  return `${safe || "contact"}.vcf`;
}
