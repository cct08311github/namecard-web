import type { CardSummary } from "@/db/cards";

export type DuplicateReason = "email-match" | "name-company-match";

export interface DuplicateGroup {
  /** A stable key derived from the matching signal — useful for React lists. */
  id: string;
  /** Why this group was clustered. If multiple signals matched, "email-match" wins. */
  reason: DuplicateReason;
  /** All cards in the group, sorted oldest-first (so the original keep candidate is index 0). */
  cards: CardSummary[];
}

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

function nameCompanyKey(card: CardSummary): string | null {
  const n = norm(card.nameZh) || norm(card.nameEn);
  const c = norm(card.companyZh) || norm(card.companyEn);
  if (!n || !c) return null;
  return `${n}::${c}`;
}

/**
 * Lightweight union-find for clustering cards by shared keys without
 * pulling a library. Tracks both parent pointer and a representative
 * "winning" reason per root so the UI can label the cluster.
 */
class UnionFind {
  parent = new Map<string, string>();
  size = new Map<string, number>();
  reason = new Map<string, DuplicateReason>();

  add(id: string): void {
    if (!this.parent.has(id)) {
      this.parent.set(id, id);
      this.size.set(id, 1);
    }
  }

  find(id: string): string {
    let cur = id;
    while (this.parent.get(cur) !== cur) {
      const p = this.parent.get(cur)!;
      this.parent.set(cur, this.parent.get(p)!); // path compression
      cur = this.parent.get(cur)!;
    }
    return cur;
  }

  /** Union with reason precedence: email-match > name-company-match. */
  union(a: string, b: string, reason: DuplicateReason): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) {
      // Upgrade reason if needed.
      if (reason === "email-match" && this.reason.get(ra) !== "email-match") {
        this.reason.set(ra, "email-match");
      }
      return;
    }
    const sa = this.size.get(ra) ?? 1;
    const sb = this.size.get(rb) ?? 1;
    const [keep, drop] = sa >= sb ? [ra, rb] : [rb, ra];
    this.parent.set(drop, keep);
    this.size.set(keep, sa + sb);
    const existing = this.reason.get(keep) ?? this.reason.get(drop);
    const winner =
      reason === "email-match" || existing === "email-match" ? "email-match" : "name-company-match";
    this.reason.set(keep, winner);
  }
}

/**
 * Cluster a set of cards into duplicate groups. Two cards are in the
 * same group when they share at least one normalized email OR have
 * identical (name, company) keys. Membership is transitive — if
 * A↔B by email and B↔C by name+company, all three end up together.
 *
 *  - Soft-deleted cards are excluded.
 *  - Singleton clusters (no actual duplicates) are NOT returned.
 *  - Cards inside each group are sorted by createdAt asc so the oldest
 *    record is the natural keep candidate.
 */
export function findDuplicateGroups(cards: readonly CardSummary[]): DuplicateGroup[] {
  const live = cards.filter((c) => !c.deletedAt);
  const uf = new UnionFind();
  for (const card of live) uf.add(card.id);

  // Index by signal — first card to claim a key sets the merge anchor.
  const emailFirst = new Map<string, string>();
  for (const card of live) {
    for (const e of card.emails) {
      const key = norm(e.value);
      if (!key) continue;
      const prior = emailFirst.get(key);
      if (prior) uf.union(prior, card.id, "email-match");
      else emailFirst.set(key, card.id);
    }
  }
  const ncFirst = new Map<string, string>();
  for (const card of live) {
    const key = nameCompanyKey(card);
    if (!key) continue;
    const prior = ncFirst.get(key);
    if (prior) uf.union(prior, card.id, "name-company-match");
    else ncFirst.set(key, card.id);
  }

  // Bucket by root.
  const byRoot = new Map<string, CardSummary[]>();
  for (const card of live) {
    const root = uf.find(card.id);
    const bucket = byRoot.get(root) ?? [];
    bucket.push(card);
    byRoot.set(root, bucket);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, bucket] of byRoot) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => {
      const ta = a.createdAt?.getTime() ?? 0;
      const tb = b.createdAt?.getTime() ?? 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
    groups.push({
      id: root,
      reason: uf.reason.get(root) ?? "name-company-match",
      cards: bucket,
    });
  }

  // Largest groups first; tiebreak on stable group id.
  groups.sort((a, b) => b.cards.length - a.cards.length || a.id.localeCompare(b.id));
  return groups;
}
