import { ImageResponse } from "next/og";

import { getCardByPublicSlug } from "@/db/cards";

export const runtime = "nodejs";
export const alt = "數位名片";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * Dynamic Open Graph image for /u/{slug} public profile. Server-rendered
 * via Next.js's ImageResponse — no external service. Uses only system
 * fonts so we don't have to bundle a heavy WOFF for the OG path. Falls
 * back to a generic card design when the slug doesn't resolve so the
 * graph crawler never gets a 404 image.
 */
export default async function Image({ params }: Params) {
  const { slug } = await params;
  const card = await getCardByPublicSlug(decodeURIComponent(slug));

  const name = card?.nameZh || card?.nameEn || "Namecard";
  const role = card?.jobTitleZh || card?.jobTitleEn || "";
  const company = card?.companyZh || card?.companyEn || "";
  const subtitle = [role, company].filter(Boolean).join(" @ ");

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "80px",
        background: "linear-gradient(135deg, #fbf9f4 0%, #f1ebe0 100%)",
        color: "#1a1814",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 28,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#7a6a4f",
          marginBottom: 24,
        }}
      >
        數位名片 · DIGITAL CARD
      </div>
      <div
        style={{
          fontSize: 96,
          fontWeight: 600,
          lineHeight: 1.1,
          marginBottom: 16,
          maxWidth: "1000px",
        }}
      >
        {name}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 40,
            color: "#403828",
            maxWidth: "1000px",
          }}
        >
          {subtitle}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          right: "80px",
          bottom: "60px",
          fontSize: 24,
          letterSpacing: 2,
          color: "#7a6a4f",
        }}
      >
        namecard
      </div>
    </div>,
    {
      ...size,
    },
  );
}
