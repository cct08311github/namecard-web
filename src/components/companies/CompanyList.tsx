"use client";

import Link from "next/link";
import { useState } from "react";

import styles from "./CompanyList.module.css";

export interface CompanyListItem {
  slug: string;
  displayName: string;
  count: number;
  /** Pre-formatted YMD or "—" — avoids Date serialization across RSC boundary. */
  mostRecentTouchYmd: string;
  headName?: string;
  headRole?: string;
  followupCount: number;
}

interface CompanyListProps {
  items: CompanyListItem[];
}

export function CompanyList({ items }: CompanyListProps) {
  const [q, setQ] = useState("");
  const lower = q.trim().toLowerCase();
  const filtered = lower ? items.filter((i) => i.displayName.toLowerCase().includes(lower)) : items;

  return (
    <>
      <div className={styles.filterRow}>
        <input
          type="search"
          className={styles.filter}
          placeholder="搜尋公司…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="搜尋公司"
        />
        {q && (
          <span className={styles.filterCount}>
            {filtered.length} / {items.length}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>沒有符合「{q}」的公司</p>
      ) : (
        <ul className={styles.companyList}>
          {filtered.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/companies/${encodeURIComponent(item.slug)}`}
                className={styles.companyRow}
              >
                <div className={styles.companyMain}>
                  <h2 className={styles.companyName}>
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
                  <p className={styles.companyMeta}>
                    {item.count} 位 · 最近：{item.mostRecentTouchYmd}
                  </p>
                </div>
                {item.headName && (
                  <div className={styles.headPreview}>
                    <span className={styles.headName}>{item.headName}</span>
                    {item.headRole && <span className={styles.headRole}>{item.headRole}</span>}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
