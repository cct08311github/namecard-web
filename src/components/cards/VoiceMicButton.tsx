"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./VoiceMicButton.module.css";

interface VoiceMicButtonProps {
  /**
   * Called whenever the recognizer emits a *final* recognized utterance.
   * Caller is responsible for appending to its own text state.
   */
  onFinalTranscript: (text: string) => void;
  /**
   * Called with the live (in-progress) interim transcript so the host
   * UI can show a "聆聽中：「…」" preview. Optional.
   */
  onInterimTranscript?: (text: string) => void;
  /** BCP-47 language tag. Defaults to zh-TW. */
  lang?: string;
  /** Disable the entire button (e.g. while parent is processing). */
  disabled?: boolean;
}

type RecognitionState = "idle" | "listening" | "denied" | "unsupported";

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
    length: number;
  }> & { length: number };
  resultIndex: number;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

function getRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Mobile-friendly mic button that wraps the browser's Web Speech API.
 * Press to toggle listening; live transcript bubbles up via the
 * `onInterimTranscript` callback while final utterances fire
 * `onFinalTranscript`. Free, no API key, no server hop — but only
 * works in browsers that support Web Speech (Chrome, Edge, modern
 * Safari). Unsupported browsers see a hidden button + a hint.
 */
export function VoiceMicButton({
  onFinalTranscript,
  onInterimTranscript,
  lang = "zh-TW",
  disabled = false,
}: VoiceMicButtonProps) {
  // Detect Web Speech support during initial state via lazy init —
  // sidesteps the react-hooks/set-state-in-effect rule (no effect needed
  // for a one-time DOM-API capability check).
  const [state, setState] = useState<RecognitionState>(() => {
    if (typeof window === "undefined") return "idle";
    return getRecognitionCtor() ? "idle" : "unsupported";
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // The Web Speech engine sometimes ends a session after a short pause.
  // We re-arm it ourselves until the user explicitly stops — read this
  // ref inside `onend` (the state snapshot in a closure would be stale).
  const wantListeningRef = useRef(false);

  const start = () => {
    if (disabled || state === "listening") return;
    const ctor = getRecognitionCtor();
    if (!ctor) {
      setState("unsupported");
      return;
    }
    const r = new ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) onFinalTranscript(final.trim());
      if (interim && onInterimTranscript) onInterimTranscript(interim.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setState("denied");
      } else {
        setState("idle");
      }
    };
    r.onend = () => {
      // Auto-restart while user *intends* to keep listening — Web
      // Speech sometimes ends after a short pause. Read the intent ref
      // (not React state) because the closure captured a stale value.
      if (recognitionRef.current === r && wantListeningRef.current) {
        try {
          r.start();
          return;
        } catch {
          // Already started or in transition — fall through.
        }
      }
      setState((s) => (s === "listening" ? "idle" : s));
    };
    recognitionRef.current = r;
    wantListeningRef.current = true;
    try {
      r.start();
      setState("listening");
    } catch {
      wantListeningRef.current = false;
      setState("idle");
    }
  };

  const stop = () => {
    wantListeningRef.current = false;
    const r = recognitionRef.current;
    if (!r) {
      setState("idle");
      return;
    }
    try {
      r.stop();
    } catch {
      // already stopped
    }
    recognitionRef.current = null;
    setState("idle");
    if (onInterimTranscript) onInterimTranscript("");
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      const r = recognitionRef.current;
      if (r) {
        try {
          r.abort();
        } catch {
          // noop
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  if (state === "unsupported") {
    return (
      <p className={styles.fallback}>
        🎙️ 你的瀏覽器不支援語音輸入（建議用 Chrome / Edge / 新版 Safari）。請打字輸入。
      </p>
    );
  }

  const listening = state === "listening";
  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={listening ? styles.btnActive : styles.btn}
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? "停止語音輸入" : "開始語音輸入"}
        title={listening ? "點擊停止" : "點擊開始說話"}
      >
        {listening ? (
          <>
            <span className={styles.pulse} aria-hidden="true" />
            🎙️ 聆聽中…（再點一次停止）
          </>
        ) : (
          "🎙️ 按住說話"
        )}
      </button>
      {state === "denied" && (
        <p className={styles.hint} role="status">
          已拒絕麥克風權限。到瀏覽器設定允許後重試。
        </p>
      )}
    </div>
  );
}
