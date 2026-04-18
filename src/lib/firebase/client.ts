"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

import { readPublicFirebaseConfig } from "./shared";

const APP_NAME = "namecard-web-client";

let cachedApp: FirebaseApp | null = null;

export function getClientApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) {
    cachedApp = existing;
    return existing;
  }
  cachedApp = initializeApp(readPublicFirebaseConfig(), APP_NAME);
  return cachedApp ?? getApp(APP_NAME);
}

export function getClientAuth(): Auth {
  const auth = getAuth(getClientApp());
  // Persist across tab reloads on the browser — cookies carry session to server.
  return auth;
}

export function getClientFirestore(): Firestore {
  return getFirestore(getClientApp());
}

export function getClientStorage(): FirebaseStorage {
  return getStorage(getClientApp());
}

export function googleAuthProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // Ask for profile + email scopes (默认已含).
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
