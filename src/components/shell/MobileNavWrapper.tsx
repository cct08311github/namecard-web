"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "./MobileNavWrapper.module.css";

interface MobileNavWrapperProps {
  /** The rail content (server-rendered) — links, brand, user footer. */
  children: React.ReactNode;
}

/**
 * Wraps the AppShell rail with mobile drawer behavior:
 *  - Hamburger button (visible only ≤768px via CSS)
 *  - Slide-in drawer + backdrop overlay
 *  - Auto-close on route change, Esc, overlay click, or any internal nav link click
 *  - Body scroll lock while open
 *
 * Above 768px, the wrapper is a transparent passthrough — the rail
 * renders inline as a normal grid column (CSS handles the responsive split).
 */
export function MobileNavWrapper({ children }: MobileNavWrapperProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Track the last pathname we observed in *state* (not a ref) so the
  // "auto-close on route change" rule can be expressed as a derived
  // state update during render — the React-blessed pattern for
  // "respond to a changing prop". Avoids both react-hooks/refs (read
  // during render) and react-hooks/set-state-in-effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  // Esc closes; body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Click on any nav link inside the drawer auto-closes (event delegation
  // — saves wrapping every Link in a click handler).
  const handleRailClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("a")) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={styles.toggle}
        aria-label={open ? "關閉選單" : "開啟選單"}
        aria-expanded={open}
        aria-controls="app-shell-rail"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>
      <div
        id="app-shell-rail"
        className={`${styles.rail} ${open ? styles.railOpen : ""}`}
        data-open={open ? "true" : "false"}
        onClick={handleRailClick}
      >
        {children}
      </div>
      {open && (
        <div
          className={styles.overlay}
          aria-hidden="true"
          onClick={() => setOpen(false)}
          data-testid="mobile-nav-overlay"
        />
      )}
    </>
  );
}
