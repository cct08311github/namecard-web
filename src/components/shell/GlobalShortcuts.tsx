"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { matchKeyEvent } from "@/lib/shortcuts/match";

import styles from "./GlobalShortcuts.module.css";

/**
 * Global keyboard shortcuts wired at AppShell level.
 * - c → /cards/new
 * - g h / g c / g t → navigate
 * - ? → show help overlay
 * - Esc → close help overlay
 *
 * The prefix buffer auto-cancels 1 second after the prefix key to
 * avoid stale state trapping the next character.
 */

const PREFIX_TIMEOUT_MS = 1000;

export function GlobalShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const prefixRef = useRef<"g" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearPrefix = () => {
      prefixRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handler = (e: KeyboardEvent) => {
      const result = matchKeyEvent(
        { prefix: prefixRef.current, helpOpen },
        {
          key: e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          target: e.target as { tagName?: string; isContentEditable?: boolean } | null,
        },
      );

      if (result.action) {
        switch (result.action.kind) {
          case "go":
            e.preventDefault();
            router.push(result.action.href);
            break;
          case "show-help":
            e.preventDefault();
            setHelpOpen(true);
            break;
          case "close-help":
            e.preventDefault();
            setHelpOpen(false);
            break;
        }
        clearPrefix();
        return;
      }

      // No action but prefix may have changed.
      if (result.nextPrefix !== prefixRef.current) {
        prefixRef.current = result.nextPrefix;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (result.nextPrefix) {
          timerRef.current = setTimeout(clearPrefix, PREFIX_TIMEOUT_MS);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [helpOpen, router]);

  if (!helpOpen) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="鍵盤快捷鍵"
      onClick={() => setHelpOpen(false)}
    >
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>鍵盤快捷鍵</h2>
          <button
            type="button"
            className={styles.close}
            aria-label="關閉"
            onClick={() => setHelpOpen(false)}
          >
            ✕
          </button>
        </header>
        <dl className={styles.list}>
          <div className={styles.row}>
            <dt>
              <kbd>c</kbd>
            </dt>
            <dd>新增名片</dd>
          </div>
          <div className={styles.row}>
            <dt>
              <kbd>g</kbd> <kbd>h</kbd>
            </dt>
            <dd>回首頁（時間軸）</dd>
          </div>
          <div className={styles.row}>
            <dt>
              <kbd>g</kbd> <kbd>c</kbd>
            </dt>
            <dd>名片冊</dd>
          </div>
          <div className={styles.row}>
            <dt>
              <kbd>g</kbd> <kbd>t</kbd>
            </dt>
            <dd>標籤</dd>
          </div>
          <div className={styles.row}>
            <dt>
              <kbd>⌘</kbd> <kbd>K</kbd>
            </dt>
            <dd>搜尋（Ctrl+K on Windows/Linux）</dd>
          </div>
          <div className={styles.row}>
            <dt>
              <kbd>?</kbd>
            </dt>
            <dd>這個畫面</dd>
          </div>
          <div className={styles.row}>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>關閉</dd>
          </div>
        </dl>
        <p className={styles.hint}>
          當你在輸入框打字時快捷鍵會自動停用。按 <kbd>?</kbd> 隨時叫出這個畫面。
        </p>
      </div>
    </div>
  );
}
