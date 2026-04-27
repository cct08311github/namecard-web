import type { NextConfig } from "next";

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
};

export default nextConfig;
