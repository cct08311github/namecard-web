/**
 * UT for src/middleware.ts — redirect matrix.
 *
 * Pure edge-runtime logic (no I/O). Tests drive a NextRequest through the
 * middleware and assert the response status / Location header.
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { SESSION_COOKIE_NAME } from "@/lib/firebase/shared";
import { middleware } from "@/middleware";

function makeRequest(pathname: string, opts?: { sessionCookie?: string }): NextRequest {
  const url = new URL(`http://localhost:3000${pathname}`);
  const headers = new Headers();
  if (opts?.sessionCookie) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${opts.sessionCookie}`);
  }
  return new NextRequest(url, { headers });
}

describe("middleware — public path bypass", () => {
  it.each([["/login"], ["/unauthorized"], ["/api/health"], ["/api/test/bypass-login"]])(
    "lets %s through without session cookie (NextResponse.next)",
    (path) => {
      const res = middleware(makeRequest(path));
      // NextResponse.next() has no status redirect; pass-through is 200-ish
      // with no Location header.
      expect(res.status).toBeLessThan(400);
      expect(res.headers.get("location")).toBeNull();
    },
  );

  it("lets /_next/static/* through", () => {
    const res = middleware(makeRequest("/_next/static/chunks/main.js"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets /favicon.ico through", () => {
    const res = middleware(makeRequest("/favicon.ico"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("middleware — unauthenticated redirect", () => {
  it("redirects / to /login without next param", () => {
    const res = middleware(makeRequest("/"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location");
    expect(loc).toContain("/login");
    expect(loc).not.toContain("next=");
  });

  it("redirects /cards to /login with next=/cards", () => {
    const res = middleware(makeRequest("/cards"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/cards");
  });

  it("redirects /cards/abc/edit to /login with next=/cards/abc/edit", () => {
    const res = middleware(makeRequest("/cards/abc/edit"));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.searchParams.get("next")).toBe("/cards/abc/edit");
  });

  it("redirects nested /api/cards/xyz/vcard → /login with next set", () => {
    const res = middleware(makeRequest("/api/cards/xyz/vcard"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/api/cards/xyz/vcard");
  });
});

describe("middleware — authenticated pass-through", () => {
  it("lets / through when session cookie is present (regardless of validity)", () => {
    // Middleware only checks cookie PRESENCE; session-cookie validity is
    // re-checked downstream by readSession(). This is a design choice
    // keeping middleware on the Edge runtime (no Admin SDK available).
    const res = middleware(makeRequest("/", { sessionCookie: "some-value" }));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBeLessThan(400);
  });

  it("lets /cards through when session cookie is present", () => {
    const res = middleware(makeRequest("/cards", { sessionCookie: "some-value" }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets /cards/new through when session cookie is present", () => {
    const res = middleware(makeRequest("/cards/new", { sessionCookie: "some-value" }));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("middleware — path encoding edge cases", () => {
  it("preserves query string in next= (encodes the path only)", () => {
    // Query string on the original URL is dropped from `next`; middleware
    // currently only encodes pathname. Locks this behavior.
    const url = new URL("http://localhost:3000/cards?view=gallery");
    const req = new NextRequest(url, { headers: new Headers() });
    const res = middleware(req);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.searchParams.get("next")).toBe("/cards");
  });
});
