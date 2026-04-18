import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/**
 * Dynamic app icon — oklch paper background with朱紅 "名" character centered.
 * Rendered on-demand by Next's ImageResponse (Satori). Kept system-font only
 * since Satori needs fonts loaded explicitly for custom fonts.
 */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fbf9f4",
        color: "#b33a1f",
        fontSize: 340,
        fontFamily: "serif",
        fontWeight: 500,
        letterSpacing: "-0.05em",
      }}
    >
      名
    </div>,
    size,
  );
}
