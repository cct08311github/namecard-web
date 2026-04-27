import type { NextConfig } from "next";

// ---------------------------------------------------------------------------
// Security response headers
// Applied to every route via the headers() hook so no individual route handler
// needs to remember them.
//
// CSP is intentionally REPORT-ONLY on first rollout: violations are logged to
// the browser console without blocking requests. This avoids breaking the
// Firebase Auth popup flow while we gather violation data. Promote to
// Content-Security-Policy once violations are resolved.
// ---------------------------------------------------------------------------
const SECURITY_HEADERS = [
  // Prevent MIME-type sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Block the page from being embedded in any frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Leak only the origin on cross-origin navigations; no path/query.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features not used by this app.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // Force HTTPS for 1 year (safe: prod is behind Tailscale HTTPS).
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  // CSP — report-only while we validate no violations during Firebase Auth
  // popup, Next.js RSC streaming, and Typesense client requests.
  // Sources covered:
  //   script-src:  Next.js inline runtime + Firebase JS SDK + Google Identity
  //   style-src:   Next.js CSS-in-JS + Google Fonts stylesheet
  //   img-src:     app images, data URIs, blob (avatar canvas), all HTTPS
  //   font-src:    Google Fonts static assets
  //   connect-src: Firebase REST/WS, Firestore, Identity Toolkit, Typesense
  //   frame-src:   Firebase Auth popup (hosted on firebaseapp.com + accounts.google.com)
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.googleapis.com https://*.firebaseapp.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://identitytoolkit.googleapis.com wss://*.firebaseio.com",
      "frame-src https://*.firebaseapp.com https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // basePath is empty in dev; set NAMECARD_BASE_PATH=/namecard-web in production
  // so all internal links, assets, and middleware routes are prefixed automatically.
  basePath: process.env.NAMECARD_BASE_PATH ?? "",

  experimental: {
    // iPhone photos are typically 3–10 MB. Raise the Server Action body limit
    // so they can reach the action layer; client-side compression further
    // reduces the payload before upload but this backstop is essential.
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },

  async headers() {
    return [
      {
        // Apply to every route (basePath is automatically prepended by Next.js).
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
