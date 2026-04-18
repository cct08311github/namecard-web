// Vitest alias target for "server-only".
// In Next.js builds the real module throws if bundled into a client chunk.
// In tests we run against the real server-side module intentionally, so
// replace the guard with a no-op export.
export {};
