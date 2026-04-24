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
  // Test-only bypass route — route handler itself returns 404 in production
  // (gated by E2E_TEST_MODE). Exposing it here just keeps it reachable for
  // Playwright under CI to mint sessions.
  if (pathname === "/api/test/bypass-login") return true;
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
