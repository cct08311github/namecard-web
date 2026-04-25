import type { MetadataRoute } from "next";

/**
 * `start_url`, `scope`, and `icons[].src` must include the deploy
 * basePath. Otherwise an installed PWA opened from the home screen
 * navigates to "/" of the host (a different service) instead of the
 * namecard app at "/namecard-web/".
 *
 * Read NAMECARD_BASE_PATH at build time (same env that next.config.ts
 * uses for `basePath`). Empty in dev, "/namecard-web" in production.
 */
const BASE = process.env.NAMECARD_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Namecard Web",
    short_name: "Namecard",
    description: "個人工作名片管理 — 以關係脈絡為核心",
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9f4",
    theme_color: "#1a1814",
    lang: "zh-Hant",
    icons: [
      {
        src: `${BASE}/icon`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${BASE}/apple-icon`,
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["productivity", "business"],
  };
}
