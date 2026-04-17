import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Namecard Web",
  description: "個人工作名片管理網站 — 以關係脈絡為核心",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
