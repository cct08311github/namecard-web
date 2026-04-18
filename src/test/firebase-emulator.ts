/**
 * SIT harness — wires firebase-admin against the local emulators.
 *
 * Requires these env vars at test runtime (set by `firebase emulators:exec`):
 *   FIRESTORE_EMULATOR_HOST      e.g. 127.0.0.1:8080
 *   FIREBASE_AUTH_EMULATOR_HOST  e.g. 127.0.0.1:9099
 *   GCLOUD_PROJECT               any stable string (we use `demo-namecard-sit`)
 */

import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT ?? "demo-namecard-sit";

let cachedApp: App | null = null;

export function isEmulatorReady(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

/**
 * Get (or init) a dedicated firebase-admin app bound to emulators.
 *
 * Under the emulator, no real credentials are needed — the Admin SDK
 * auto-detects FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST and
 * routes traffic there with an unsigned token. Using a different app name
 * than production's `namecard-web-admin` keeps SIT isolated.
 */
export function getSitAdminApp(): App {
  if (cachedApp) return cachedApp;
  const existing = getApps().find((app) => app.name === "sit");
  if (existing) {
    cachedApp = existing;
    return existing;
  }
  cachedApp = initializeApp(
    {
      projectId: EMULATOR_PROJECT_ID,
    },
    "sit",
  );
  return cachedApp;
}

export function getSitFirestore(): Firestore {
  return getFirestore(getSitAdminApp());
}

export function getSitAuth(): Auth {
  return getAuth(getSitAdminApp());
}

/** Wipe all Firestore data via the emulator's REST endpoint. */
export async function clearFirestoreEmulator(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) throw new Error("FIRESTORE_EMULATOR_HOST not set");
  const url = `http://${host}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Firestore emulator clear failed: ${res.status} ${await res.text()}`);
  }
}

/** Wipe all Auth users via the emulator's REST endpoint. */
export async function clearAuthEmulator(): Promise<void> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!host) throw new Error("FIREBASE_AUTH_EMULATOR_HOST not set");
  const url = `http://${host}/emulator/v1/projects/${EMULATOR_PROJECT_ID}/accounts`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Auth emulator clear failed: ${res.status} ${await res.text()}`);
  }
}

export async function resetEmulators(): Promise<void> {
  await Promise.all([clearFirestoreEmulator(), clearAuthEmulator()]);
}

/** Tear down the SIT app — call from afterAll if isolation is needed. */
export async function disposeSitApp(): Promise<void> {
  if (cachedApp) {
    await deleteApp(cachedApp);
    cachedApp = null;
  }
}

export interface EmulatorTestUser {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

/**
 * Create a user in the Auth emulator and return an ID token suitable for
 * `verifyIdToken` (sessions, safe-action) round-trips.
 */
export async function seedEmulatorUser(user: EmulatorTestUser): Promise<string> {
  const auth = getSitAuth();
  try {
    await auth.deleteUser(user.uid);
  } catch {
    // ignore: user may not exist yet
  }
  await auth.createUser({
    uid: user.uid,
    email: user.email,
    emailVerified: true,
    displayName: user.displayName,
    photoURL: user.photoURL,
  });
  const customToken = await auth.createCustomToken(user.uid);
  return exchangeCustomTokenForIdToken(customToken);
}

async function exchangeCustomTokenForIdToken(customToken: string): Promise<string> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!host) throw new Error("FIREBASE_AUTH_EMULATOR_HOST not set");
  const url = `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!res.ok) {
    throw new Error(`Custom token exchange failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { idToken?: string };
  if (!body.idToken) throw new Error("Emulator did not return an idToken");
  return body.idToken;
}
