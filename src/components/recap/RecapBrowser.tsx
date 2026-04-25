"use client";

import { useMemo, useState } from "react";

import { groupRecapByDay, type RecapItem } from "@/lib/recap/group";
import { filterRecapItems } from "@/lib/recap/search";

import { RecapList } from "./RecapList";
import styles from "./RecapBrowser.module.css";

interface RecapBrowserProps {
  items: RecapItem[];
}

/**
 * Client wrapper that lets the user filter the server-loaded recap
 * items by free-text query. Re-runs `groupRecapByDay` on the filtered
 * subset so the day labels update naturally as items disappear.
 *
 * Re-creates a fresh `now` per render so that long-lived sessions get
 * accurate "今天 / 昨天" labels without needing a server refresh — the
 * cost is negligible since groupRecapByDay is pure and small.
 */
export function RecapBrowser({ items }: RecapBrowserProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => filterRecapItems(items, query), [items, query]);
  const groups = useMemo(() => groupRecapByDay(filtered, new Date()), [filtered]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.input}
          placeholder="🔍 搜尋對話 — 試試「SaaS」、「陳玉涵」、「demo day」"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜尋對話內容、人名、公司"
        />
        {hasQuery && <span className={styles.count}>{filtered.length} 筆</span>}
      </div>

      {hasQuery && filtered.length === 0 ? (
        <p className={styles.empty}>找不到符合「{query.trim()}」的對話 — 試試別的關鍵字。</p>
      ) : (
        <RecapList groups={groups} />
      )}
    </div>
  );
}
