"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import styles from "./MobileFab.module.css";

/**
 * Custom event used by the FAB's "🔍 找人" action to ask `GlobalShortcuts`
 * to open the QuickSearchPalette without lifting state into AppShell.
 * Listener registered in GlobalShortcuts.
 */
export const OPEN_SEARCH_EVENT = "namecard:openSearch";

/**
 * Mobile-only floating action button. Defaults to a single ⊕ glyph in
 * the bottom-right; tap toggles a small action sheet with the three
 * highest-frequency captures (對話速記, 語音建卡, 找人). Backdrop click
 * + Esc both close. Hidden on ≥769px via media query in the .css module.
 */
export function MobileFab() {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSearch = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
    }
  };

  return (
    <div className={styles.root}>
      {open && (
        <button
          type="button"
          className={styles.backdrop}
          onClick={() => setOpen(false)}
          aria-label="關閉快速動作"
        />
      )}
      {open && (
        <div ref={sheetRef} className={styles.sheet} role="menu" aria-label="快速動作">
          <Link
            href="/log"
            className={styles.action}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            🗣️ 對話速記
          </Link>
          <Link
            href="/cards/voice"
            className={styles.action}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            🎙️ 語音建卡
          </Link>
          <button type="button" className={styles.action} role="menuitem" onClick={handleSearch}>
            🔍 找人
          </button>
        </div>
      )}
      <button
        type="button"
        className={open ? styles.fabOpen : styles.fab}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "關閉快速動作" : "打開快速動作"}
      >
        {open ? "×" : "⊕"}
      </button>
    </div>
  );
}
