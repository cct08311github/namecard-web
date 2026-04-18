import "server-only";

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";
import fs from "node:fs";
import path from "node:path";

import { FIREBASE_PROJECT_ID } from "./shared";

/**
 * Lazily resolve Firebase Admin App.
 * - Uses GOOGLE_APPLICATION_CREDENTIALS env (pointing to service-account.json).
 * - Falls back to Application Default Credentials if set up via gcloud.
 * - In tests, caller may pass an explicit ServiceAccount to `initAdmin(sa)`.
 */

const APP_NAME = "namecard-web-admin";

let cachedApp: App | null = null;

function loadServiceAccountFromEnv(): ServiceAccount | null {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) return null;
  const resolved = path.isAbsolute(credPath) ? credPath : path.resolve(process.cwd(), credPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`GOOGLE_APPLICATION_CREDENTIALS points to missing file: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(`Service account JSON at ${resolved} missing required fields`);
  }
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  };
}

export function getAdminApp(): App {
  if (cachedApp) return cachedApp;
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) {
    cachedApp = existing;
    return existing;
  }
  const sa = loadServiceAccountFromEnv();
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || sa?.projectId || FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "Firebase Admin: no project id resolvable from env (FIREBASE_ADMIN_PROJECT_ID / service account / NEXT_PUBLIC_FIREBASE_PROJECT_ID)",
    );
  }
  // Build options without a `credential` key when no service account is
  // resolved — Firebase Admin 13 rejects `{ credential: undefined }` as
  // invalid (code 'app/invalid-app-options'). Omitting the key lets the
  // SDK use Application Default Credentials or, when emulator env vars
  // are set, auto-route to the local emulator with no credential at all.
  const appOptions: Parameters<typeof initializeApp>[0] = {
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };
  if (sa) {
    appOptions.credential = cert(sa);
  }
  cachedApp = initializeApp(appOptions, APP_NAME);
  // Next.js double-init guard: fetch the existing app if we already initialized once.
  return cachedApp ?? getApp(APP_NAME);
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminStorage(): Storage {
  return getStorage(getAdminApp());
}
