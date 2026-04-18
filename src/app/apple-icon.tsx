import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Apple touch icon — darker墨黑 background so home-screen badge reads on
 * light and dark iOS wallpapers. Same 名 mark as the main app icon.
 */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1814",
        color: "#fbf9f4",
        fontSize: 120,
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
