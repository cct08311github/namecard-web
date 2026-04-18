import type { CardCreateInput } from "@/db/schema";

/**
 * Deterministic, user-authored tag rules. Returns tag NAMES (not ids).
 *
 * Keep each rule short and testable. Add 5–10 lines that match your
 * actual card corpus — see the commented examples below for shape.
 *
 * All rules must be pure: no I/O, no mutation, no randomness.
 * Return an empty array means "no rule fired" — the LLM layer will
 * still run.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- skeleton; user will reference card once they add rules
export function suggestTagsByRules(card: CardCreateInput): string[] {
  const hits = new Set<string>();

  // TODO(user): add your own 5–10 rules. Examples to adapt (delete when done):
  //
  // // Industry by company keyword
  // if (/google|microsoft|meta|apple|amazon|nvidia/i.test(card.companyEn ?? "")) hits.add("tech");
  // if (/goldman|jpmorgan|morgan stanley|citigroup/i.test(card.companyEn ?? "")) hits.add("finance");
  // if (/台積|聯發科|鴻海|廣達/.test(card.companyZh ?? "")) hits.add("半導體");
  //
  // // Email TLD / context
  // if (card.emails.some((e) => /\.edu$/i.test(e.value))) hits.add("academic");
  // if (card.emails.some((e) => /\.gov(\.|$)/i.test(e.value))) hits.add("government");
  //
  // // Title seniority
  // const title = `${card.jobTitleEn ?? ""} ${card.jobTitleZh ?? ""}`;
  // if (/ceo|cto|cfo|founder|創辦人|執行長/i.test(title)) hits.add("executive");

  return [...hits];
}
