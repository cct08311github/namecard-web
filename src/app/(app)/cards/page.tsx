import Link from "next/link";

import { CardGallery } from "@/components/cards/CardGallery";
import { CardList } from "@/components/cards/CardList";
import { ExportButton } from "@/components/cards/ExportButton";
import { TagFilterBar } from "@/components/cards/TagFilterBar";
import { ViewToggle } from "@/components/cards/ViewToggle";
import { listCardsForUser, type CardSummary } from "@/db/cards";
import { listTagsForUser } from "@/db/tags";
import { readSession } from "@/lib/firebase/session";
import { applyTagFilter } from "@/lib/cards/filter";
import { getTypesenseClient } from "@/lib/search/client";
import { buildSearchParams } from "@/lib/search/query";
import { CARDS_COLLECTION_NAME } from "@/lib/search/schema";
import { parseSearchParams } from "@/lib/search/url";

import styles from "./cards.module.css";

export const metadata = {
  title: "名片冊",
};

const MAX_CARDS = 500;

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
  const sort = typeof raw.sort === "string" ? raw.sort : "newest";
  const isGallery = view !== "list";
  const orderBy: "createdAt" | "updatedAt" = "createdAt";
  const order: "asc" | "desc" = sort === "oldest" ? "asc" : "desc";
  const { q, tag, tagMode } = parseSearchParams(raw);

  const [allCards, allTags] = await Promise.all([
    listCardsForUser(user.uid, { limit: 200, orderBy, order }),
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

      {cards.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>
            開始建立你的第一張名片—— 可以是剛見面的人、也可以是想記錄下來的舊朋友。
          </p>
          <Link href="/cards/new" className={styles.emptyBtn}>
            建立第一張名片
          </Link>
        </div>
      ) : isGallery ? (
        <CardGallery cards={cards} />
      ) : (
        <CardList cards={cards} />
      )}
    </article>
  );
}
