import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";

/**
 * Per-user daily OCR scan limit enforced via a Firestore counter.
 *
 * Document path: users/{uid}/scanLimits/{YYYY-MM-DD}
 * The document is created on first scan and auto-expires semantically
 * (a new date key is used each day; no TTL config needed for correctness).
 *
 * Atomic via a Firestore transaction so concurrent requests from the same
 * user can't race past the limit (P1, #248).
 */

export async function incrementAndCheckScanLimit(
  uid: string,
  limit: number,
): Promise<{ allowed: boolean; usedToday: number }> {
  const db = getAdminFirestore();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const docRef = db.collection("users").doc(uid).collection("scanLimits").doc(today);

  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const current = (snap.data()?.count ?? 0) as number;
    if (current >= limit) {
      return { allowed: false, usedToday: current };
    }
    tx.set(
      docRef,
      { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { allowed: true, usedToday: current + 1 };
  });
}
