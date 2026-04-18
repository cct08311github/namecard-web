import Link from "next/link";

import styles from "./ViewToggle.module.css";

interface ViewToggleProps {
  current: "gallery" | "list";
  sort: string;
}

export function ViewToggle({ current, sort }: ViewToggleProps) {
  const buildHref = (view: "gallery" | "list") => {
    const params = new URLSearchParams();
    if (view === "list") params.set("view", "list");
    if (sort && sort !== "newest") params.set("sort", sort);
    const qs = params.toString();
    return qs ? `/cards?${qs}` : "/cards";
  };

  return (
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
  );
}
