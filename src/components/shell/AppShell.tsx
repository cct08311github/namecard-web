import Link from "next/link";

import { signOutAction } from "@/app/(auth)/login/actions";
import { SearchBox } from "@/components/search/SearchBox";
import type { SessionUser } from "@/lib/firebase/session";

import styles from "./AppShell.module.css";
import { GlobalShortcuts } from "./GlobalShortcuts";
import { MobileFab } from "./MobileFab";
import { MobileNavWrapper } from "./MobileNavWrapper";

interface NavItem {
  href: string;
  label: string;
  description: string;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "時間軸", description: "最近沒聯絡 · 本月認識" },
  { href: "/followups", label: "追蹤", description: "誰該 ping 了" },
  { href: "/intros", label: "🤝 介紹建議", description: "AI 找誰跟誰應該認識" },
  { href: "/cards", label: "名片冊", description: "畫廊 · 清單" },
  { href: "/cards/new", label: "新增", description: "手動建立一張" },
  { href: "/cards/voice", label: "🎙️ 語音建卡", description: "講 30 秒讓 AI 解析" },
  { href: "/log", label: "🗣️ 對話速記", description: "講一句 log 進對方的卡" },
  { href: "/recap", label: "📓 對話日誌", description: "最近 14 天 log 過的對話" },
  { href: "/companies", label: "公司", description: "同公司聯絡人聚合" },
  { href: "/events", label: "場合", description: "同場合認識的人" },
  { href: "/tags", label: "標籤", description: "分類 · 重新命名" },
  { href: "/import", label: "匯入", description: "vCard / CSV / LinkedIn" },
  { href: "/workspace/members", label: "成員", description: "邀請 · 權限" },
];

interface AppShellProps {
  user: SessionUser;
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      {/* SearchBox lives at the shell root so the trigger stays reachable
          on mobile (where the rail is hidden behind the hamburger drawer)
          and so its dialog overlays both rail and main. */}
      <div className={styles.searchHost}>
        <SearchBox />
      </div>
      <MobileNavWrapper>
        <aside className={styles.rail} aria-label="Primary navigation">
          <Link href="/" className={styles.brand}>
            <span className={styles.brandGlyph}>N</span>
            <span className={styles.brandWord}>Namecard</span>
          </Link>

          <nav>
            <p className={styles.navLabel}>導覽</p>
            <ul className={styles.navList}>
              {PRIMARY.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={styles.link}>
                    <span className={styles.linkLabel}>{item.label}</span>
                    <span className={styles.linkHint}>{item.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <footer className={styles.footer}>
            <div className={styles.userRow}>
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="" width={28} height={28} className={styles.avatar} />
              ) : (
                <span className={styles.avatarFallback} aria-hidden="true">
                  {user.displayName?.slice(0, 1) ?? user.email.slice(0, 1)}
                </span>
              )}
              <span className={styles.userName}>
                {user.displayName ?? user.email.split("@")[0]}
              </span>
            </div>
            <form action={signOutAction}>
              <button type="submit" className={styles.signOut}>
                登出
              </button>
            </form>
          </footer>
        </aside>
      </MobileNavWrapper>
      <main className={styles.main}>{children}</main>
      <MobileFab />
      <GlobalShortcuts />
    </div>
  );
}
