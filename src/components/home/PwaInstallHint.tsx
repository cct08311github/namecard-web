"use client";

import { useEffect, useState } from "react";

import styles from "./PwaInstallHint.module.css";

const STORAGE_KEY = "namecard:pwa-hint-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type State = "hidden" | "show";

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPad on iOS 13+ identifies as Macintosh; check touch support too.
  const isIPad = /iPad|Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  return /iPhone|iPod/i.test(ua) || isIPad;
}

/**
 * Pure synchronous detect — runs in lazy useState init so we never
 * trigger setState-in-effect (cascading-render rule). SSR returns
 * "hidden"; browser checks viewport / standalone / localStorage.
 */
function detectShouldShow(): State {
  if (typeof window === "undefined") return "hidden";
  if (window.matchMedia?.("(display-mode: standalone)").matches) return "hidden";
  try {
    if (window.localStorage?.getItem(STORAGE_KEY)) return "hidden";
  } catch {
    // Storage blocked (Safari private mode etc.) — proceed and show.
  }
  const isMobile = window.matchMedia?.("(max-width: 768px)").matches ?? false;
  return isMobile ? "show" : "hidden";
}

/**
 * One-time mobile install hint. Hidden on desktop, hidden once installed
 * (display-mode: standalone), hidden once user dismisses (persisted).
 *
 * Android Chrome may emit a `beforeinstallprompt` event before render —
 * we capture it via useEffect listener and use it to trigger the native
 * picker when the user opts in. iOS has no programmatic prompt; we
 * surface a plain-text instruction "Share → Add to Home Screen".
 */
export function PwaInstallHint() {
  const [state, setState] = useState<State>(() => detectShouldShow());
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    if (state !== "show") return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [state]);

  const dismiss = () => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setState("hidden");
  };

  const triggerInstall = async () => {
    if (installEvent) {
      await installEvent.prompt();
      await installEvent.userChoice;
      dismiss();
      return;
    }
    if (detectIOS()) {
      setShowIosTip(true);
      return;
    }
    // Other browsers without beforeinstallprompt — show iOS-style tip
    // text as a generic fallback.
    setShowIosTip(true);
  };

  if (state !== "show") return null;

  return (
    <aside className={styles.banner} role="region" aria-label="安裝到手機桌面">
      <div className={styles.body}>
        <p className={styles.title}>📱 把 namecard 加到手機桌面</p>
        <p className={styles.subtitle}>
          像 native app 一樣全螢幕開啟，桌面有圖示直接點 — 不用每次找 browser bookmark。
        </p>
        {showIosTip && (
          <p className={styles.iosTip}>
            iOS Safari 步驟：點下方「分享」⤴︎ → 「加入主畫面」 → 完成。
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={triggerInstall}>
          {showIosTip ? "了解" : "怎麼裝？"}
        </button>
        <button type="button" className={styles.secondary} onClick={dismiss}>
          稍後再說
        </button>
      </div>
    </aside>
  );
}
