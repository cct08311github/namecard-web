import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // basePath is empty in dev; set NAMECARD_BASE_PATH=/namecard-web in production
  // so all internal links, assets, and middleware routes are prefixed automatically.
  basePath: process.env.NAMECARD_BASE_PATH ?? "",
};

export default nextConfig;
