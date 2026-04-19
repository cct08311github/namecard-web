/**
 * Test-only bypass route for Playwright E2E.
 *
 * In production this route is disabled. It activates only when
 * `E2E_TEST_MODE=1` is set on the server process (CI's e2e-crud job).
 *
 * Flow:
 *  1. Client POSTs { uid, email, displayName? }
 *  2. Admin SDK (pointed at Auth emulator via FIREBASE_AUTH_EMULATOR_HOST)
 *     creates/updates the user + mints a custom token
 *  3. Custom token exchanged for an ID token via the emulator REST endpoint
 *  4. createSession() runs the normal ALLOWED_EMAILS + cookie pipeline
 *  5. Client has a real session cookie identical to the production flow
 *
 * This lets Playwright skip the Google popup but exercises every server-side
 * auth step (verifyIdToken, whitelist, session cookie signing).
 */
import { NextResponse } from "next/server";

import { getAdminAuth } from "@/lib/firebase/server";
import { createSession } from "@/lib/firebase/session";
import { ensurePersonalWorkspace } from "@/lib/workspace/ensure";

export const dynamic = "force-dynamic";

interface BypassBody {
  uid?: string;
  email?: string;
  displayName?: string;
}

function isEnabled(): boolean {
  return process.env.E2E_TEST_MODE === "1";
}

export async function POST(request: Request) {
  if (!isEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const authEmuHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!authEmuHost) {
    return NextResponse.json(
      { error: "FIREBASE_AUTH_EMULATOR_HOST not set; bypass requires emulator" },
      { status: 500 },
    );
  }

  let body: BypassBody;
  try {
    body = (await request.json()) as BypassBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const uid = body.uid;
  const email = body.email;
  if (!uid || !email) {
    return NextResponse.json({ error: "uid and email required" }, { status: 400 });
  }

  const adminAuth = getAdminAuth();
  try {
    await adminAuth.updateUser(uid, {
      email,
      emailVerified: true,
      displayName: body.displayName,
    });
  } catch {
    await adminAuth.createUser({
      uid,
      email,
      emailVerified: true,
      displayName: body.displayName,
    });
  }

  const customToken = await adminAuth.createCustomToken(uid);
  const exchangeUrl = `http://${authEmuHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=bypass`;
  const exchangeRes = await fetch(exchangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!exchangeRes.ok) {
    return NextResponse.json(
      { error: "custom token exchange failed", status: exchangeRes.status },
      { status: 502 },
    );
  }
  const { idToken } = (await exchangeRes.json()) as { idToken?: string };
  if (!idToken) {
    return NextResponse.json({ error: "no idToken returned" }, { status: 502 });
  }

  const user = await createSession(idToken);
  // Mirror the production login flow (src/app/(auth)/login/actions.ts):
  // createSession alone does not create the Firestore workspace doc.
  // Without this call, /workspace/members throws "Workspace 不存在".
  await ensurePersonalWorkspace({ uid: user.uid, displayName: user.displayName });
  return NextResponse.json({ ok: true, uid: user.uid, email: user.email });
}
