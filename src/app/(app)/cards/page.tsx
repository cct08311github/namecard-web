import Link from "next/link";

import { CardsSelectionShell } from "@/components/cards/CardsSelectionShell";
import { ExportButton } from "@/components/cards/ExportButton";
import { PinnedFilterChip } from "@/components/cards/PinnedFilterChip";
import { TagFilterBar } from "@/components/cards/TagFilterBar";
import { TemperatureFilterBar } from "@/components/cards/TemperatureFilterBar";
import { ViewToggle } from "@/components/cards/ViewToggle";
import { listCardsForUser, type CardSummary } from "@/db/cards";
import { listTagsForUser } from "@/db/tags";
import { readSession } from "@/lib/firebase/session";
import { signedUrlsForBatch } from "@/lib/storage/card-images";
import { findDuplicateGroups } from "@/lib/cards/duplicates";
import { applyTagFilter, countByTemperature, filterByTemperature } from "@/lib/cards/filter";
import type { TemperatureLevel } from "@/lib/cards/relationship-temp";
import { parseSortKey, sortCards } from "@/lib/cards/sort";
import { getTypesenseClient } from "@/lib/search/client";
import { buildSearchParams } from "@/lib/search/query";
import { CARDS_COLLECTION_NAME } from "@/lib/search/schema";
import { parseSearchParams } from "@/lib/search/url";
import { countFollowupsInCards } from "@/lib/timeline/followups";

import styles from "./cards.module.css";

export const metadata = {
  title: "名片冊",
};

const MAX_CARDS = 500;

const TEMP_LEVELS: ReadonlySet<TemperatureLevel> = new Set([
  "hot",
  "warm",
  "active",
  "quiet",
  "cold",
]);

function parseTempParam(raw: string | string[] | undefined): TemperatureLevel[] {
  if (!raw) return [];
  const tokens = (Array.isArray(raw) ? raw.join(",") : raw).split(",").map((s) => s.trim());
  const out: TemperatureLevel[] = [];
  const seen = new Set<TemperatureLevel>();
  for (const t of tokens) {
    if (TEMP_LEVELS.has(t as TemperatureLevel) && !seen.has(t as TemperatureLevel)) {
      seen.add(t as TemperatureLevel);
      out.push(t as TemperatureLevel);
    }
  }
  return out;
}

interface CardsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function typesenseConfigured(): boolean {
  return Boolean(process.env.TYPESENSE_HOST && process.env.TYPESENSE_API_KEY);
}

/**
 * When q or tag filters are present, run a Typesense search and project
 * the hits back through `getCardForUser` so card rendering stays
 * unchanged. Falls through to the list path when Typesense is down or
 * there's no query.
 */
async function searchCardIds(
  uid: string,
  q: string,
  tagIds: string[],
  tagMode: "and" | "or",
): Promise<string[] | null> {
  if (!typesenseConfigured()) return null;
  try {
    const params = buildSearchParams({ q, memberUid: uid, tagIds, tagMode, limit: 100 });
    const res = await getTypesenseClient()
      .collections(CARDS_COLLECTION_NAME)
      .documents()
      .search(params);
    return (res.hits ?? []).map((h) => (h.document as { id: string }).id);
  } catch (err) {
    console.error("[cards/page] search failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const user = await readSession();
  if (!user) return null;
  const raw = await searchParams;
  const view = typeof raw.view === "string" ? raw.view : "gallery";
  const sort = parseSortKey(raw.sort);
  const isGallery = view !== "list";
  const { q, tag, tagMode } = parseSearchParams(raw);

  // Always fetch in createdAt desc (Firestore-side); we do the final
  // sort client-side on the page to support 「最近聯絡」 / 「姓名」
  // keys without needing per-key Firestore indexes. 200-card ceiling
  // makes this cheap.
  const [allCards, allTags] = await Promise.all([
    listCardsForUser(user.uid, { limit: 200, orderBy: "createdAt", order: "desc" }),
    listTagsForUser(user.uid),
  ]);

  let cards: CardSummary[];
  const hasSearchState = q.length > 0 || tag.length > 0;
  if (hasSearchState) {
    const ids = await searchCardIds(user.uid, q, tag, tagMode);
    if (ids && ids.length > 0) {
      const byId = new Map(allCards.map((c) => [c.id, c]));
      cards = ids.map((id) => byId.get(id)).filter((c): c is CardSummary => Boolean(c));
    } else if (ids === null && tag.length > 0) {
      // Typesense unreachable — fall back to client-side tag filter so
      // the UI stays usable even with search down.
      cards = applyTagFilter(allCards, tag, tagMode);
    } else {
      cards = [];
    }
  } else {
    cards = allCards;
  }

  // Apply the user's chosen sort — Typesense search path already
  // orders hits by relevance, but once we're showing the full list
  // (or a tag-filtered list) we respect the segment control.
  if (!q) cards = sortCards(cards, sort);

  // Temperature filter applies last (after sort) so the URL state stays
  // composable with all other filters and the chip counts reflect the
  // tag-filtered universe, not the temperature-filtered one.
  const now = new Date();
  const selectedTempLevels = parseTempParam(raw.temp);
  const tempCounts = countByTemperature(cards, now);
  if (selectedTempLevels.length > 0) {
    cards = filterByTemperature(cards, selectedTempLevels, now);
  }

  // Pinned-only filter — composable with all other filters. URL: ?pinned=1.
  const pinnedOnly = raw.pinned === "1";
  if (pinnedOnly) {
    cards = cards.filter((c) => c.isPinned);
  }
  // Total pinned count for the chip label, computed from the pre-pinned-
  // filter universe so users can see how many they have to choose from.
  const pinnedCount = allCards.filter((c) => c.isPinned).length;

  // Surface a duplicate-count nudge in the header. Computed over the
  // unfiltered list so the link is visible regardless of the current
  // search/tag state — the actual /cards/duplicates page also runs
  // its own independent scan, so this is just a notification.
  const duplicateGroupCount = hasSearchState ? 0 : findDuplicateGroups(allCards).length;

  // Follow-up urgency chip — always computed against the full corpus
  // (not the currently-filtered view) so users can't lose sight of
  // pending action items by accidentally filtering them out.
  const followupsTotal = countFollowupsInCards(allCards, now);

  // Mint signed URLs only for the visible cards' frontImagePath. Batched
  // via Promise.allSettled so a stale/missing storage object doesn't
  // bring down the whole list. Backed by the storage CDN behind a 15-min
  // signed URL — adequate caching for the normal browse loop.
  const imagePaths = cards.map((c) => c.frontImagePath).filter((p): p is string => Boolean(p));
  const pathToUrl = await signedUrlsForBatch(imagePaths);
  const imageUrls: Record<string, string> = {};
  for (const c of cards) {
    if (c.frontImagePath && pathToUrl[c.frontImagePath]) {
      imageUrls[c.id] = pathToUrl[c.frontImagePath]!;
    }
  }

  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>名片冊</p>
          <h1 className={styles.title}>
            {cards.length ? (
              <>
                {cards.length} 張名片
                {hasSearchState && q ? (
                  <em className={styles.searchQuery}>{` · 搜尋「${q}」`}</em>
                ) : (
                  <em>。</em>
                )}
              </>
            ) : hasSearchState ? (
              `沒有符合「${q}」的名片`
            ) : (
              "還沒有名片"
            )}
          </h1>
        </div>
        <div className={styles.controls}>
          {followupsTotal > 0 && (
            <Link href="/followups" className={styles.followupChip} title="到追蹤頁查看待聯絡的人">
              ⏰ {followupsTotal} 個人該 ping 了
            </Link>
          )}
          {duplicateGroupCount > 0 && (
            <Link
              href="/cards/duplicates"
              className={styles.duplicatesLink}
              title="有重複名片可合併"
            >
              {duplicateGroupCount} 組可合併
            </Link>
          )}
          <ViewToggle current={isGallery ? "gallery" : "list"} sort={sort} />
          {cards.length > 0 && (
            <ExportButton
              cardIds={
                hasSearchState && cards.length < MAX_CARDS ? cards.map((c) => c.id) : undefined
              }
            />
          )}
          <Link href="/cards/new" className={styles.newBtn}>
            新增
          </Link>
        </div>
      </header>

      <TagFilterBar tags={allTags} selectedIds={tag} tagMode={tagMode} />
      <TemperatureFilterBar counts={tempCounts} selected={selectedTempLevels} />
      <PinnedFilterChip active={pinnedOnly} totalPinned={pinnedCount} />

      {cards.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>
            開始建立你的第一張名片—— 可以是剛見面的人、也可以是想記錄下來的舊朋友。
          </p>
          <Link href="/cards/new" className={styles.emptyBtn}>
            建立第一張名片
          </Link>
        </div>
      ) : (
        <CardsSelectionShell
          cards={cards}
          view={isGallery ? "gallery" : "list"}
          tags={allTags}
          imageUrls={imageUrls}
        />
      )}
    </article>
  );
}
