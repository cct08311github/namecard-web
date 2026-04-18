import "server-only";

import { cookies } from "next/headers";

import { getAdminAuth } from "./server";
import { SESSION_COOKIE_MAX_AGE_MS, SESSION_COOKIE_NAME } from "./shared";

export interface SessionUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

function isEmailAllowed(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAILS ?? "";
  const list = allowed
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * Exchange a Firebase ID token (obtained on the client after Google sign-in)
 * for a server-side session cookie. Writes the cookie and returns the user payload.
 *
 * Throws if the email is not in ALLOWED_EMAILS whitelist.
 */
export async function createSession(idToken: string): Promise<SessionUser> {
  const adminAuth = getAdminAuth();
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  if (!decoded.email) {
    throw new Error("Google account did not return an email claim");
  }
  if (!isEmailAllowed(decoded.email)) {
    throw new Error(`Email ${decoded.email} is not in ALLOWED_EMAILS whitelist`);
  }
  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_COOKIE_MAX_AGE_MS,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    maxAge: Math.floor(SESSION_COOKIE_MAX_AGE_MS / 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
  return {
    uid: decoded.uid,
    email: decoded.email,
    displayName: decoded.name,
    photoURL: decoded.picture,
  };
}

/** Read & verify the current session cookie. Returns null if missing/invalid. */
export async function readSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(raw, true);
    if (!decoded.email || !isEmailAllowed(decoded.email)) {
      return null;
    }
    return {
      uid: decoded.uid,
      email: decoded.email,
      displayName: decoded.name,
      photoURL: decoded.picture,
    };
  } catch {
    return null;
  }
}

/** Clear the session cookie. Call on sign-out. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
