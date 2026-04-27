/**
 * Build a LinkedIn people-search URL pre-filled with the contact's
 * name + company. Returns null when neither field has content (no
 * usable search query).
 *
 * LinkedIn URL: https://www.linkedin.com/search/results/people/?keywords={...}
 * Both Chinese and Latin names work — LinkedIn's search handles
 * either. Combining name + company narrows the result set
 * dramatically vs. name alone for common names like "陳玉涵".
 */
export function linkedInSearchUrl(opts: { name?: string; company?: string }): string | null {
  const parts: string[] = [];
  if (opts.name?.trim()) parts.push(opts.name.trim());
  if (opts.company?.trim()) parts.push(opts.company.trim());
  if (parts.length === 0) return null;
  const keywords = parts.join(" ");
  const params = new URLSearchParams({ keywords });
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}
