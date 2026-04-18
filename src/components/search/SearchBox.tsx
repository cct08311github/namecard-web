"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { searchCardsAction } from "@/app/(app)/cards/search-actions";

import styles from "./SearchBox.module.css";

interface SearchHitView {
  id: string;
  nameZh?: string;
  nameEn?: string;
  companyZh?: string;
  companyEn?: string;
  highlights: Record<string, string>;
}

/**
 * Global ⌘K search overlay. Debounces keystrokes 200ms, renders hits
 * in a dialog over the app, deep-links to /cards?q=... when the user
 * presses Enter to explore beyond the preview.
 *
 * Keyboard:
 *   ⌘K / Ctrl+K → open
 *   Esc         → close
 *   Enter       → navigate to /cards?q=<query>
 */
export function SearchBox() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHitView[]>([]);
  const [pending, setPending] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close + reset state in one place so we don't rely on setState inside
  // an effect that reacts to `open` changing.
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setHits([]);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const toggle = isMac
        ? e.key.toLowerCase() === "k" && e.metaKey
        : e.key.toLowerCase() === "k" && e.ctrlKey;
      if (toggle) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setHits([]);
      setPending(false);
      return;
    }
    setPending(true);
    const result = await searchCardsAction({ q: query, limit: 8 });
    const data = result?.data;
    if (data) {
      setHits(data.hits);
      setDegraded(data.degraded);
    }
    setPending(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void runSearch(q), 200);
    return () => clearTimeout(t);
  }, [q, open, runSearch]);

  const hasAnything = useMemo(() => q.trim().length > 0, [q]);

  function onEnter() {
    const query = q.trim();
    if (!query) return;
    close();
    router.push(`/cards?q=${encodeURIComponent(query)}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="開啟搜尋"
      >
        <span>搜尋</span>
        <kbd className={styles.kbd}>⌘K</kbd>
      </button>
    );
  }

  return (
    <div className={styles.backdrop} onClick={close}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="搜尋名片"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          placeholder="搜尋姓名、公司、為什麼記得..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter();
          }}
          aria-label="搜尋輸入框"
        />
        <div className={styles.results} role="listbox">
          {degraded && (
            <p className={styles.degradedNotice}>
              搜尋服務暫時無法連線，請稍後再試或用名片冊瀏覽。
            </p>
          )}
          {hasAnything && !pending && hits.length === 0 && !degraded && (
            <p className={styles.emptyNotice}>沒有符合的名片。</p>
          )}
          {hits.map((hit) => (
            <Link
              key={hit.id}
              href={`/cards/${hit.id}`}
              className={styles.hit}
              onClick={close}
              role="option"
            >
              <span className={styles.hitName}>{hit.nameZh ?? hit.nameEn ?? "(未命名)"}</span>
              {(hit.companyZh || hit.companyEn) && (
                <span className={styles.hitCompany}>{hit.companyZh ?? hit.companyEn}</span>
              )}
              {hit.highlights.whyRemember && (
                <span className={styles.hitSnippet}>
                  <HighlightSnippet text={hit.highlights.whyRemember} />
                </span>
              )}
            </Link>
          ))}
          {hasAnything && hits.length > 0 && (
            <button type="button" className={styles.seeAll} onClick={onEnter}>
              看所有結果 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Render Typesense highlight snippet safely. The API wraps matches in
 * `<mark>...</mark>`; we split on that pattern and render JSX instead
 * of dangerouslySetInnerHTML, so no HTML injection is possible even
 * if the indexed content was adversarial.
 */
function HighlightSnippet({ text }: { text: string }) {
  const MAX = 200;
  const trimmed = text.length > MAX ? `${text.slice(0, MAX)}…` : text;
  const parts = trimmed.split(/(<mark>.*?<\/mark>)/gi);
  const markPattern = /^<mark>(.*?)<\/mark>$/i;
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(markPattern);
        if (match) {
          return (
            <mark key={i} className={styles.mark}>
              {match[1]}
            </mark>
          );
        }
        // Strip any stray tags an adversarial dataset might inject.
        const clean = part.replace(/<[^>]+>/g, "");
        return <Fragment key={i}>{clean}</Fragment>;
      })}
    </>
  );
}
