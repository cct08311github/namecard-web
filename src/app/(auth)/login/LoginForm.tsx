"use client";

import { FirebaseError } from "firebase/app";
import { getRedirectResult, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { getClientAuth, googleAuthProvider } from "@/lib/firebase/client";

import { signInWithIdTokenAction } from "./actions";
import styles from "./login.module.css";

interface LoginFormProps {
  next?: string;
}

/**
 * iOS Safari (and most in-app browsers) silently break signInWithPopup —
 * popup gets blocked, opens but never resolves the credential, or the
 * 3rd-party-cookie story breaks. Detect those and fall back to the
 * redirect-based flow.
 *
 * Conservative — when uncertain we'd rather take the redirect path
 * than let the user stare at a hung popup (issue #233).
 */
function shouldUseRedirect(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

type ErrorKind =
  | null
  | { kind: "popup-blocked" }
  | { kind: "popup-closed" }
  | { kind: "not-allowed" }
  | { kind: "timeout" }
  | { kind: "unknown"; message: string };

function describeError(error: ErrorKind): string | null {
  if (!error) return null;
  switch (error.kind) {
    case "popup-blocked":
      return "瀏覽器封鎖了彈出視窗，請允許 popup 後重試。";
    case "popup-closed":
      return "你關閉了登入視窗。再試一次。";
    case "not-allowed":
      return "此 Google 帳號不在 ALLOWED_EMAILS 白名單內。";
    case "timeout":
      return "登入超過 15 秒沒有回應。試試清掉 cookie 或開無痕視窗，或按 F12 看 console 有什麼紅字。";
    case "unknown":
      return error.message;
  }
}

/**
 * 15 s — long enough for slow popup + Firebase verify + workspace
 * bootstrap; short enough that a wedged action surfaces feedback
 * before the user gives up.
 */
export const SIGNIN_TIMEOUT_MS = 15_000;

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorKind>(null);
  // Watchdog: if the transition doesn't resolve in 15 s, surface a
  // visible timeout error. Without this the button just sits on
  // 「驗證中…」 forever — the symptom user reported in #233.
  const [timedOut, setTimedOut] = useState(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the watchdog whenever pending flips back to false (success
  // OR caught-error path — both setError(...) calls above end the
  // transition naturally).
  useEffect(() => {
    if (!pending && watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, [pending]);

  const finalizeSignIn = (idToken: string) => {
    setError(null);
    setTimedOut(false);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      setTimedOut(true);
      setError({ kind: "timeout" });
    }, SIGNIN_TIMEOUT_MS);
    startTransition(async () => {
      const result = await signInWithIdTokenAction({ idToken, next });
      if (result?.serverError) {
        setError(
          result.serverError.includes("ALLOWED_EMAILS")
            ? { kind: "not-allowed" }
            : { kind: "unknown", message: result.serverError },
        );
        return;
      }
      const target = result?.data?.next ?? "/";
      router.push(target);
      router.refresh();
    });
  };

  // After a redirect-based sign-in (iOS Safari path), Google bounces
  // the user back here. getRedirectResult returns the credential; we
  // exchange it for a session cookie via the same server action.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = getClientAuth();
        const credential = await getRedirectResult(auth);
        if (cancelled || !credential) return;
        const idToken = await credential.user.getIdToken(true);
        finalizeSignIn(idToken);
      } catch (err) {
        if (cancelled) return;
        setError({
          kind: "unknown",
          message: err instanceof Error ? err.message : "未知錯誤",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — getRedirectResult is one-shot per page load

  const handleSignIn = () => {
    setError(null);
    setTimedOut(false);
    const auth = getClientAuth();
    const provider = googleAuthProvider();

    if (shouldUseRedirect()) {
      // signInWithRedirect navigates away — the result comes back via
      // the useEffect above on the next page load. Don't start a
      // transition here; pending will flip true after redirect.
      signInWithRedirect(auth, provider).catch((err) => {
        setError({
          kind: "unknown",
          message: err instanceof Error ? err.message : "redirect failed",
        });
      });
      return;
    }

    // Desktop / non-iOS: popup is faster, no page reload.
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      setTimedOut(true);
      setError({ kind: "timeout" });
    }, SIGNIN_TIMEOUT_MS);
    startTransition(async () => {
      try {
        const credential = await signInWithPopup(auth, provider);
        const idToken = await credential.user.getIdToken(true);
        const result = await signInWithIdTokenAction({ idToken, next });
        if (result?.serverError) {
          setError(
            result.serverError.includes("ALLOWED_EMAILS")
              ? { kind: "not-allowed" }
              : { kind: "unknown", message: result.serverError },
          );
          return;
        }
        const target = result?.data?.next ?? "/";
        router.push(target);
        router.refresh();
      } catch (err) {
        if (err instanceof FirebaseError) {
          if (err.code === "auth/popup-blocked") setError({ kind: "popup-blocked" });
          else if (err.code === "auth/popup-closed-by-user") setError({ kind: "popup-closed" });
          else setError({ kind: "unknown", message: err.message });
          return;
        }
        setError({
          kind: "unknown",
          message: err instanceof Error ? err.message : "未知錯誤",
        });
      }
    });
  };

  // Button label: timed-out trumps pending so the user sees something
  // actionable; without timeout we fall back to the original two states.
  const buttonLabel = timedOut ? "請重新整理頁面再試" : pending ? "驗證中…" : "以 Google 帳號登入";

  return (
    <div className={styles.formWrap}>
      <button type="button" className={styles.button} onClick={handleSignIn} disabled={pending}>
        <GoogleG />
        <span>{buttonLabel}</span>
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {describeError(error)}
        </p>
      )}
    </div>
  );
}

function GoogleG() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.185l-2.908-2.258c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.705A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.705V4.963H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.037l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.963L3.964 7.295C4.672 5.168 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}
