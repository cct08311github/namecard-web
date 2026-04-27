import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { FirebaseError } from "firebase/app";

import { LoginForm, SIGNIN_TIMEOUT_MS } from "../LoginForm";

// Stub away all the auth surface so we can drive the LoginForm flow
// in isolation. Each test re-mocks signInWithPopup as needed.
const signInWithPopupMock = vi.fn();
const signInWithIdTokenActionMock = vi.fn();

const signInWithRedirectMock = vi.fn(() => Promise.resolve());
const getRedirectResultMock = vi.fn(() => Promise.resolve(null));

vi.mock("firebase/auth", () => ({
  signInWithPopup: (...args: unknown[]) => signInWithPopupMock(...args),
  signInWithRedirect: (...args: unknown[]) => signInWithRedirectMock(...args),
  getRedirectResult: (...args: unknown[]) => getRedirectResultMock(...args),
  GoogleAuthProvider: vi.fn(),
}));
vi.mock("@/lib/firebase/client", () => ({
  getClientAuth: vi.fn(() => ({})),
  googleAuthProvider: vi.fn(() => ({})),
}));
vi.mock("../actions", () => ({
  signInWithIdTokenAction: (...args: unknown[]) => signInWithIdTokenActionMock(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("LoginForm watchdog timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signInWithPopupMock.mockReset();
    signInWithIdTokenActionMock.mockReset();
    // Default: hang forever so timeout tests deterministically reach the deadline
    signInWithPopupMock.mockImplementation(() => new Promise(() => {}));
    signInWithIdTokenActionMock.mockImplementation(() => new Promise(() => {}));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not show timeout error before the deadline", async () => {
    render(<LoginForm />);
    await act(async () => {
      screen.getByRole("button").click();
    });
    await act(async () => {
      vi.advanceTimersByTime(SIGNIN_TIMEOUT_MS - 100);
    });
    expect(screen.queryByText(/登入超過 15 秒/)).toBeNull();
  });

  it("shows the timeout error after SIGNIN_TIMEOUT_MS elapses", async () => {
    render(<LoginForm />);
    await act(async () => {
      screen.getByRole("button").click();
    });
    await act(async () => {
      vi.advanceTimersByTime(SIGNIN_TIMEOUT_MS);
    });
    expect(screen.getByText(/登入超過 15 秒/)).toBeInTheDocument();
    expect(screen.getByText(/請重新整理頁面再試/)).toBeInTheDocument();
  });
});

describe("LoginForm error paths", () => {
  beforeEach(() => {
    signInWithPopupMock.mockReset();
    signInWithIdTokenActionMock.mockReset();
  });

  it("shows the popup-blocked message when Firebase throws auth/popup-blocked", async () => {
    signInWithPopupMock.mockRejectedValue(new FirebaseError("auth/popup-blocked", "popup blocked"));
    render(<LoginForm />);
    await act(async () => {
      screen.getByRole("button").click();
    });
    await waitFor(() => {
      expect(screen.getByText(/封鎖了彈出視窗/)).toBeInTheDocument();
    });
  });

  it("shows the popup-closed message when user dismisses the popup", async () => {
    signInWithPopupMock.mockRejectedValue(new FirebaseError("auth/popup-closed-by-user", "closed"));
    render(<LoginForm />);
    await act(async () => {
      screen.getByRole("button").click();
    });
    await waitFor(() => {
      expect(screen.getByText(/關閉了登入視窗/)).toBeInTheDocument();
    });
  });

  it("shows the not-allowed message when server rejects ALLOWED_EMAILS", async () => {
    signInWithPopupMock.mockResolvedValue({
      user: { getIdToken: vi.fn().mockResolvedValue("fake-token") },
    });
    signInWithIdTokenActionMock.mockResolvedValue({
      serverError: "Email x@y.com is not in ALLOWED_EMAILS whitelist",
    });
    render(<LoginForm />);
    await act(async () => {
      screen.getByRole("button").click();
    });
    await waitFor(() => {
      expect(screen.getByText(/ALLOWED_EMAILS 白名單內/)).toBeInTheDocument();
    });
  });
});

describe("LoginForm iOS redirect path", () => {
  beforeEach(() => {
    signInWithPopupMock.mockReset();
    signInWithIdTokenActionMock.mockReset();
    signInWithRedirectMock.mockReset();
    signInWithRedirectMock.mockResolvedValue(undefined);
    getRedirectResultMock.mockReset();
    getRedirectResultMock.mockResolvedValue(null);
    // Force the iOS branch
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
    });
  });
  afterEach(() => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: () => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    });
  });

  it("uses signInWithRedirect on iOS instead of popup", async () => {
    render(<LoginForm />);
    await act(async () => {
      screen.getByRole("button").click();
    });
    await waitFor(() => {
      expect(signInWithRedirectMock).toHaveBeenCalledTimes(1);
    });
    expect(signInWithPopupMock).not.toHaveBeenCalled();
  });

  it("calls finalizeSignIn when getRedirectResult returns a credential on mount", async () => {
    signInWithIdTokenActionMock.mockResolvedValue({ data: { ok: true, next: "/" } });
    getRedirectResultMock.mockResolvedValue({
      user: { getIdToken: vi.fn().mockResolvedValue("redirect-token") },
    });
    render(<LoginForm />);
    await waitFor(() => {
      expect(signInWithIdTokenActionMock).toHaveBeenCalledTimes(1);
    });
    expect(signInWithIdTokenActionMock.mock.calls[0]![0].idToken).toBe("redirect-token");
  });

  it("surfaces an error when signInWithRedirect itself rejects", async () => {
    signInWithRedirectMock.mockRejectedValueOnce(new Error("redirect blocked"));
    render(<LoginForm />);
    await act(async () => {
      screen.getByRole("button").click();
    });
    await waitFor(() => {
      expect(screen.getByText(/redirect blocked/)).toBeInTheDocument();
    });
  });

  it("surfaces an error when getRedirectResult on mount throws", async () => {
    getRedirectResultMock.mockRejectedValueOnce(new Error("invalid auth state"));
    render(<LoginForm />);
    await waitFor(() => {
      expect(screen.getByText(/invalid auth state/)).toBeInTheDocument();
    });
  });

  it("does not call signInWithIdTokenAction when getRedirectResult returns null", async () => {
    getRedirectResultMock.mockResolvedValue(null);
    render(<LoginForm />);
    // Give the useEffect a microtask to settle
    await act(async () => {
      await Promise.resolve();
    });
    expect(signInWithIdTokenActionMock).not.toHaveBeenCalled();
  });
});
