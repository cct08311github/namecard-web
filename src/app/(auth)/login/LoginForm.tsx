"use client";

import { FirebaseError } from "firebase/app";
import { signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { getClientAuth, googleAuthProvider } from "@/lib/firebase/client";

import { signInWithIdTokenAction } from "./actions";
import styles from "./login.module.css";

interface LoginFormProps {
  next?: string;
}

type ErrorKind =
  | null
  | { kind: "popup-blocked" }
  | { kind: "popup-closed" }
  | { kind: "not-allowed" }
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
    case "unknown":
      return error.message;
  }
}

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ErrorKind>(null);

  const handleSignIn = () => {
    setError(null);
    startTransition(async () => {
      try {
        const auth = getClientAuth();
        const credential = await signInWithPopup(auth, googleAuthProvider());
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

  return (
    <div className={styles.formWrap}>
      <button type="button" className={styles.button} onClick={handleSignIn} disabled={pending}>
        <GoogleG />
        <span>{pending ? "驗證中…" : "以 Google 帳號登入"}</span>
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
