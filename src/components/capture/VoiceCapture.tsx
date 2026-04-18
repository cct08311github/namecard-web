"use client";

import { useRef, useState, useSyncExternalStore } from "react";

import styles from "./VoiceCapture.module.css";

interface VoiceCaptureProps {
  onTranscript: (text: string) => void;
  /** BCP 47 tags; default prefers zh-TW but falls back to browser default. */
  languages?: string[];
}

interface BrowserSpeechRecognitionEvent extends Event {
  results: {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
    isFinal?: boolean;
  };
  resultIndex: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
      .webkitSpeechRecognition
  );
}

const EMPTY_SUBSCRIBE = () => () => {};
const getSupportedClient = () => Boolean(getSpeechRecognitionCtor());
const getSupportedServer = (): boolean | null => null;

/**
 * Voice-capture button for the whyRemember field. Uses browser's
 * native SpeechRecognition (webkitSpeechRecognition fallback). Works
 * offline-in-browser on Chrome/Edge/Safari, enabling the "wrap up
 * the meeting, dictate why you remember this person" flow.
 *
 * On unsupported browsers (Firefox, older Safari) the button is
 * hidden — user falls back to typing.
 */
export function VoiceCapture({
  onTranscript,
  languages = ["zh-TW", "zh-CN", "en-US"],
}: VoiceCaptureProps) {
  // useSyncExternalStore keeps SSR snapshot (null) stable while client
  // snapshot reflects real browser support — avoids setState-in-effect.
  const supported = useSyncExternalStore(EMPTY_SUBSCRIBE, getSupportedClient, getSupportedServer);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [langIdx, setLangIdx] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  function startListening() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    setError(null);
    const r = new Ctor();
    r.lang = languages[langIdx] ?? languages[0] ?? "zh-TW";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (event) => {
      const res = event.results[event.resultIndex];
      if (!res) return;
      const alt = res[0];
      if (alt && alt.transcript) {
        onTranscript(alt.transcript.trim());
      }
    };
    r.onerror = (event) => {
      const reason = event.error || "unknown";
      if (reason === "no-speech") {
        setError("沒聽到聲音，請再試一次");
      } else if (reason === "not-allowed" || reason === "service-not-allowed") {
        setError("需要麥克風權限才能用語音");
      } else {
        setError(`語音錯誤：${reason}`);
      }
      setListening(false);
    };
    r.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    try {
      r.start();
      recognitionRef.current = r;
      setListening(true);
    } catch (err) {
      setError(`無法啟動語音：${(err as Error).message}`);
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function cycleLanguage() {
    setLangIdx((idx) => (idx + 1) % languages.length);
  }

  if (supported === null) return null;
  if (supported === false) return null;

  return (
    <div className={styles.voice}>
      <div className={styles.controls}>
        <button
          type="button"
          className={`${styles.micBtn} ${listening ? styles.listening : ""}`}
          onClick={listening ? stopListening : startListening}
          aria-pressed={listening}
        >
          <span aria-hidden="true" className={styles.micIcon}>
            {listening ? "■" : "🎙"}
          </span>
          <span>{listening ? "停止錄音" : "按這裡講「為什麼記得」"}</span>
        </button>
        <button
          type="button"
          className={styles.langBtn}
          onClick={cycleLanguage}
          aria-label="Cycle language"
        >
          {languages[langIdx]}
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <p className={styles.hint}>說完後會自動加到下面的文字框。可以再手動修改。</p>
    </div>
  );
}
