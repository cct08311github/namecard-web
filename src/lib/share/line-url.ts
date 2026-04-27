/**
 * Build a LINE deep-link URL for a given LINE ID.
 *
 * LINE ID formats:
 *  - Public IDs starting with "@" use `line://ti/p/@foo` / `https://line.me/ti/p/%40foo`
 *  - Personal user IDs (no "@") use `https://line.me/ti/p/~{id}`
 *
 * Returns null when lineId is empty or whitespace.
 *
 * This is the single source of truth for the LINE deep-link formula; both
 * the card-detail sidebar and CardActions import from here so the two
 * surfaces always stay in sync.
 */
export function lineDeepLink(lineId: string | null | undefined): string | null {
  const id = lineId?.trim();
  if (!id) return null;
  if (id.startsWith("@")) {
    return `https://line.me/ti/p/${encodeURIComponent(id)}`;
  }
  return `https://line.me/ti/p/~${encodeURIComponent(id)}`;
}
