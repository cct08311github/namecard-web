import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, Noto_Serif_TC } from "next/font/google";

import "./globals.css";

const notoSerifTC = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-serif-tc",
  display: "swap",
  preload: true,
});

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

// Same basePath the manifest itself reads — links here must resolve
// under the deploy prefix or installed PWAs land on the wrong host.
const BASE = process.env.NAMECARD_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: {
    default: "Namecard Web",
    template: "%s · Namecard Web",
  },
  description: "個人工作名片管理網站 — 以關係脈絡為核心",
  applicationName: "Namecard Web",
  authors: [{ name: "cct08311github" }],
  manifest: `${BASE}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    title: "Namecard",
    statusBarStyle: "default",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f4" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1814" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${notoSerifTC.variable} ${fraunces.variable} ${inter.variable}`}
    >
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
