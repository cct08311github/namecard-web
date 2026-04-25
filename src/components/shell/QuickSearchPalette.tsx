"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { searchCardsAction, type SearchHit } from "@/app/(app)/cards/search-actions";

import styles from "./QuickSearchPalette.module.css";

interface QuickSearchPaletteProps {
  open: boolean;
  onClose: () => void;
}

const DEBOUNCE_MS = 140;
const RESULT_LIMIT = 8;

function displayName(hit: SearchHit): string {
  return hit.nameZh || hit.nameEn || "（未命名）";
}

function displayCompany(hit: SearchHit): string {
  return hit.companyZh || hit.companyEn || "";
}

/**
 * `Cmd+K` / `Ctrl+K` / `/` opens this palette anywhere in the app.
 * Typesense-backed search with a 140ms debounce; arrow keys to nav,
 * Enter to jump to detail. Esc closes. Text inputs do NOT swallow
 * `Cmd+K` (the matcher lets it through), so users can hop here from
 * the new-card form mid-edit to look someone up.
 */
/**
 * Wrapper that remounts the inner palette whenever `open` flips on. That
 * lets the inner component own its own initial state without needing
 * a "reset on prop change" effect (which violates set-state-in-effect).
 */
export function QuickSearchPalette({ open, onClose }: QuickSearchPaletteProps) {
  if (!open) return null;
  return <QuickSearchPaletteInner onClose={onClose} />;
}

function QuickSearchPaletteInner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, setPending] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const listboxId = useId();

  // Focus the input on mount. setState is *not* called here — the
  // initial state already covers reset-on-open since this component is
  // remounted by the wrapper whenever open flips on.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  // Debounced search — every keystroke schedules; previous timer wins.
  // No early-return setStates: when the trimmed query is empty we just
  // skip the fetch and the existing state (initial empty arrays) renders
  // the hint screen.
  const trimmed = query.trim();
  useEffect(() => {
    if (!trimmed) return;
    // setPending lives inside the timer (not the effect body) to
    // satisfy the set-state-in-effect rule — pending is a side-effect
    // of the actual fetch starting, not of the effect mounting.
    const timer = setTimeout(async () => {
      setPending(true);
      try {
        const result = await searchCardsAction({ q: trimmed, limit: RESULT_LIMIT });
        // The action may resolve after the user kept typing — bail out if
        // the input no longer matches.
        if (inputRef.current?.value.trim() !== trimmed) return;
        if (result?.data) {
          setHits(result.data.hits.slice(0, RESULT_LIMIT));
          setDegraded(result.data.degraded);
          setActiveIndex(0);
        } else if (result?.serverError) {
          setHits([]);
          setDegraded(true);
        }
      } finally {
        setPending(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = hits[activeIndex];
      if (target) {
        router.push(`/cards/${target.id}`);
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="搜尋名片"
      onClick={onClose}
    >
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.inputRow}>
          <span className={styles.icon} aria-hidden="true">
            🔎
          </span>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="搜尋名片：姓名、公司、為什麼記得…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
            aria-controls={listboxId}
            aria-activedescendant={
              hits[activeIndex] ? `palette-hit-${hits[activeIndex].id}` : undefined
            }
          />
          {pending && <span className={styles.spinner} aria-label="搜尋中" />}
        </div>

        {degraded && (
          <p className={styles.degraded} role="status">
            搜尋服務暫時不可用，請從名片冊瀏覽。
          </p>
        )}

        {!query.trim() ? (
          <p className={styles.hint}>
            開始輸入即時搜尋。 ↑ ↓ 切換，<kbd>Enter</kbd> 進入，<kbd>Esc</kbd> 關閉。
          </p>
        ) : hits.length === 0 && !pending ? (
          <p className={styles.empty}>沒有符合「{query}」的名片</p>
        ) : (
          <ul id={listboxId} className={styles.list} role="listbox" aria-label="搜尋結果">
            {hits.map((hit, i) => {
              const company = displayCompany(hit);
              const isActive = i === activeIndex;
              return (
                <li
                  key={hit.id}
                  id={`palette-hit-${hit.id}`}
                  role="option"
                  aria-selected={isActive}
                  className={isActive ? styles.itemActive : styles.item}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => {
                    router.push(`/cards/${hit.id}`);
                    onClose();
                  }}
                >
                  <div className={styles.itemMain}>
                    <span className={styles.itemName}>{displayName(hit)}</span>
                    {company && <span className={styles.itemCompany}>{company}</span>}
                  </div>
                  {hit.whyRemember && <p className={styles.itemWhy}>{hit.whyRemember}</p>}
                </li>
              );
            })}
          </ul>
        )}

        <footer className={styles.footer}>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> 移動
          </span>
          <span>
            <kbd>Enter</kbd> 開啟
          </span>
          <span>
            <kbd>Esc</kbd> 關閉
          </span>
        </footer>
      </div>
    </div>
  );
}
