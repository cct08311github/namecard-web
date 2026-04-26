"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import styles from "./PinnedFilterChip.module.css";

interface PinnedFilterChipProps {
  /** True when the page is currently filtering to pinned-only. */
  active: boolean;
  /** Total pinned cards in the workspace, shown in the chip label. */
  totalPinned: number;
}

/**
 * Toggle chip that adds/removes ?pinned=1 from the URL. Server reads
 * the URL on the next render and applies the filter; this component
 * only owns the URL mutation.
 */
export function PinnedFilterChip({ active, totalPinned }: PinnedFilterChipProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (totalPinned === 0) return null;

  const toggle = () => {
    const next = new URLSearchParams(params.toString());
    if (active) next.delete("pinned");
    else next.set("pinned", "1");
    startTransition(() => {
      router.replace(next.toString() ? `?${next.toString()}` : "?", { scroll: false });
    });
  };

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={active ? styles.chipActive : styles.chip}
        onClick={toggle}
        disabled={pending}
        aria-pressed={active}
        title={active ? "顯示全部" : "只看重要聯絡人"}
      >
        📍 只看重要 ({totalPinned})
      </button>
    </div>
  );
}
