"use client";

import Link from "next/link";
import { useState } from "react";

import styles from "./EventList.module.css";

export interface EventListItem {
  slug: string;
  displayName: string;
  count: number;
  /** Pre-formatted YMD or "—" — avoids Date serialization across RSC boundary. */
  mostRecentMetYmd: string;
  followupCount: number;
}

interface EventListProps {
  items: EventListItem[];
}

export function EventList({ items }: EventListProps) {
  const [q, setQ] = useState("");
  const lower = q.trim().toLowerCase();
  const filtered = lower ? items.filter((i) => i.displayName.toLowerCase().includes(lower)) : items;

  return (
    <>
      <div className={styles.filterRow}>
        <input
          type="search"
          className={styles.filter}
          placeholder="搜尋場合…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="搜尋場合"
        />
        {q && (
          <span className={styles.filterCount}>
            {filtered.length} / {items.length}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>沒有符合「{q}」的場合</p>
      ) : (
        <ul className={styles.eventList}>
          {filtered.map((item) => (
            <li key={item.slug}>
              <Link href={`/events/${encodeURIComponent(item.slug)}`} className={styles.eventRow}>
                <div className={styles.eventMain}>
                  <h2 className={styles.eventName}>
                    {item.displayName}
                    {item.followupCount > 0 && (
                      <span
                        className={styles.followupBadge}
                        aria-label={`${item.followupCount} 個人該 ping 了`}
                      >
                        ⏰ {item.followupCount}
                      </span>
                    )}
                  </h2>
                  <p className={styles.eventMeta}>
                    {item.count} 位 · 最近見面：{item.mostRecentMetYmd}
                  </p>
                </div>
                <span className={styles.chevron} aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
