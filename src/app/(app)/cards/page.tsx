import Link from "next/link";

import { CardGallery } from "@/components/cards/CardGallery";
import { CardList } from "@/components/cards/CardList";
import { ViewToggle } from "@/components/cards/ViewToggle";
import { listCardsForUser } from "@/db/cards";
import { readSession } from "@/lib/firebase/session";

import styles from "./cards.module.css";

export const metadata = {
  title: "名片冊",
};

interface CardsPageProps {
  searchParams: Promise<{ view?: string; sort?: string }>;
}

export default async function CardsPage({ searchParams }: CardsPageProps) {
  const user = await readSession();
  if (!user) return null;
  const { view = "gallery", sort = "newest" } = await searchParams;
  const isGallery = view !== "list";
  const orderBy: "createdAt" | "updatedAt" = "createdAt";
  const order: "asc" | "desc" = sort === "oldest" ? "asc" : "desc";
  const cards = await listCardsForUser(user.uid, { orderBy, order, limit: 200 });

  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>名片冊</p>
          <h1 className={styles.title}>
            {cards.length ? (
              <>
                {cards.length} 張名片<em>。</em>
              </>
            ) : (
              "還沒有名片"
            )}
          </h1>
        </div>
        <div className={styles.controls}>
          <ViewToggle current={isGallery ? "gallery" : "list"} sort={sort} />
          <Link href="/cards/new" className={styles.newBtn}>
            新增
          </Link>
        </div>
      </header>

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
