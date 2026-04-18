import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Namecard Web",
    short_name: "Namecard",
    description: "個人工作名片管理 — 以關係脈絡為核心",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9f4",
    theme_color: "#1a1814",
    lang: "zh-Hant",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["productivity", "business"],
  };
}
