import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/firebase/shared";

const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/unauthorized",
  "/api/health",
  // PWA metadata — must be reachable without a session so the browser can
  // install the app from the login page.
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  // Public profile pages: /u/{slug} renders a single user's card without
  // auth so it can be shared like a digital business card.
  if (pathname.startsWith("/u/")) return true;
  // Test-only bypass route — only exempt from auth when BOTH conditions hold:
  //   • E2E_TEST_MODE=1                     (explicitly enabled for the current run)
  //   • FIREBASE_AUTH_EMULATOR_HOST is set  (confirms an emulator environment)
  //
  // NODE_ENV is intentionally NOT used: `next start` (CI E2E) runs with
  // NODE_ENV=production, so a NODE_ENV check would block the bypass in the
  // exact scenario it's needed. FIREBASE_AUTH_EMULATOR_HOST is a clearer,
  // deliberate signal of a test environment — the route handler's own guard
  // already relies on it — and it would never be set in a real production
  // deploy. This middleware layer is defence-in-depth: even if the route
  // handler's guard were accidentally removed, the route stays unreachable
  // unless both vars are present.
  if (
    pathname === "/api/test/bypass-login" &&
    process.env.E2E_TEST_MODE === "1" &&
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)
  )
    return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    // Clone `nextUrl` (a NextURL) so Next.js auto-prepends the configured
    // `basePath` on redirect. Using `new URL("/login", request.url)` does
    // NOT add basePath — it resolves to the raw host root — which under
    // our Tailscale sub-path deploy goes to a foreign proxy and returns
    // 502. `nextUrl.clone()` preserves basePath semantics.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Run on every route except:
     * - static assets (/_next/static, /_next/image)
     * - public files (favicon, robots.txt, etc.)
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
