/**
 * Shared Firebase constants & types usable by both server and client SDKs.
 * Never import firebase-admin or firebase/* into this file.
 */

export const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";

export const SESSION_COOKIE_NAME = "__nc_session";
export const SESSION_COOKIE_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export const COLLECTION_WORKSPACES = "workspaces";
export const SUB_COLLECTION_CARDS = "cards";
export const SUB_COLLECTION_TAGS = "tags";

/** Personal workspace id is exactly the user uid — see AGENTS.md invariant #1. */
export function personalWorkspaceId(uid: string): string {
  return uid;
}

export function cardsPath(workspaceId: string): string {
  return `${COLLECTION_WORKSPACES}/${workspaceId}/${SUB_COLLECTION_CARDS}`;
}

export function tagsPath(workspaceId: string): string {
  return `${COLLECTION_WORKSPACES}/${workspaceId}/${SUB_COLLECTION_TAGS}`;
}

export interface PublicFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function readPublicFirebaseConfig(): PublicFirebaseConfig {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Missing Firebase public config: ${missing.join(", ")}. Check .env.local.`);
  }
  return config;
}
