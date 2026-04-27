/**
 * Format a contact summary for clipboard paste — typically used when
 * introducing two people via email / Slack / LINE.
 *
 * Skips empty fields so we never paste a hanging line. Bilingual
 * names render as "中 (英)" when both exist, otherwise just whichever
 * is present.
 */
export interface ContactSummaryInput {
  nameZh?: string;
  nameEn?: string;
  jobTitleZh?: string;
  jobTitleEn?: string;
  companyZh?: string;
  companyEn?: string;
  primaryEmail?: string;
  primaryPhone?: string;
}

export function formatContactSummary(input: ContactSummaryInput): string {
  const lines: string[] = [];
  const name = formatBilingual(input.nameZh, input.nameEn);
  if (name) lines.push(name);
  const role = pickFirst(input.jobTitleZh, input.jobTitleEn);
  const company = pickFirst(input.companyZh, input.companyEn);
  if (role && company) lines.push(`${role} @ ${company}`);
  else if (role) lines.push(role);
  else if (company) lines.push(`@ ${company}`);
  if (input.primaryEmail) lines.push(`📧 ${input.primaryEmail}`);
  if (input.primaryPhone) lines.push(`📞 ${input.primaryPhone}`);
  return lines.join("\n");
}

function pickFirst(a?: string, b?: string): string | undefined {
  const aTrim = a?.trim();
  if (aTrim) return aTrim;
  const bTrim = b?.trim();
  if (bTrim) return bTrim;
  return undefined;
}

function formatBilingual(zh?: string, en?: string): string | undefined {
  const zhTrim = zh?.trim();
  const enTrim = en?.trim();
  if (zhTrim && enTrim) return `${zhTrim}（${enTrim}）`;
  return zhTrim || enTrim || undefined;
}
