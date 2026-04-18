import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登入",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
