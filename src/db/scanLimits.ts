/**
 * OCR scan rate-limit counter.
 *
 * Stores per-user daily counters at:
 *   users/{uid}/scanLimits/{YYYY-MM-DD}
 *
 * Each document has a single `count` field that is atomically
 * incremented via FieldValue.increment so concurrent requests never
 * race each other. The day boundary uses UTC so the counter rolls over
 * predictably regardless of the server timezone.
 */

import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/server";

/**
 * Atomically increments the caller's daily scan counter and reports
 * whether the new total is within the configured limit.
 *
 * @param uid   - Firebase Auth UID of the authenticated user.
 * @param limit - Maximum scans allowed per day (inclusive).
 * @returns `{ allowed: true, usedToday }` when the quota has not been
 *          reached, or `{ allowed: false, usedToday }` when it has.
 */
export async function incrementAndCheckScanLimit(
  uid: string,
  limit: number,
): Promise<{ allowed: boolean; usedToday: number }> {
  const db = getAdminFirestore();
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
  const ref = db.doc(`users/${uid}/scanLimits/${today}`);

  const after = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? ((snap.data()?.count as number | undefined) ?? 0) : 0;
    const next = current + 1;
    tx.set(ref, { count: FieldValue.increment(1) }, { merge: true });
    return next;
  });

  return { allowed: after <= limit, usedToday: after };
}
