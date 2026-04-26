import Link from "next/link";

import type { SortKey } from "@/lib/cards/sort";

import styles from "./ViewToggle.module.css";

interface ViewToggleProps {
  current: "gallery" | "list";
  sort: SortKey;
}

const SORT_OPTIONS: Array<{ key: SortKey; label: string; title: string }> = [
  { key: "newest", label: "最新建立", title: "最近新增的名片在前" },
  { key: "contacted", label: "最近聯絡", title: "最近互動過的在前；從未聯絡的排最後" },
  { key: "name", label: "姓名", title: "依中文筆畫 / 字母排序" },
  { key: "tempHot", label: "🔥 熱→冷", title: "最 active 關係在前" },
  { key: "tempCold", label: "💤 冷→熱", title: "最 stale 在前 — 該 rekindle 誰一目了然" },
];

export function ViewToggle({ current, sort }: ViewToggleProps) {
  const buildHref = (view: "gallery" | "list", nextSort: SortKey = sort) => {
    const params = new URLSearchParams();
    if (view === "list") params.set("view", "list");
    if (nextSort && nextSort !== "newest") params.set("sort", nextSort);
    const qs = params.toString();
    return qs ? `/cards?${qs}` : "/cards";
  };

  return (
    <div className={styles.row}>
      <div className={styles.toggle} role="group" aria-label="View mode">
        <Link
          href={buildHref("gallery")}
          className={`${styles.option} ${current === "gallery" ? styles.active : ""}`}
          aria-pressed={current === "gallery"}
        >
          畫廊
        </Link>
        <Link
          href={buildHref("list")}
          className={`${styles.option} ${current === "list" ? styles.active : ""}`}
          aria-pressed={current === "list"}
        >
          清單
        </Link>
      </div>
      <div className={styles.toggle} role="group" aria-label="Sort">
        {SORT_OPTIONS.map((opt) => (
          <Link
            key={opt.key}
            href={buildHref(current, opt.key)}
            className={`${styles.option} ${sort === opt.key ? styles.active : ""}`}
            aria-pressed={sort === opt.key}
            title={opt.title}
          >
            {opt.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
