import Link from "next/link";

import styles from "./SideRail.module.css";

interface NavItem {
  href: string;
  label: string;
  disabled?: boolean;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "時間軸", disabled: true },
  { href: "/cards", label: "名片冊", disabled: true },
  { href: "/tags", label: "標籤", disabled: true },
];

const SECONDARY: NavItem[] = [
  { href: "/import", label: "匯入", disabled: true },
  { href: "/settings", label: "設定", disabled: true },
];

function NavLink({ item }: { item: NavItem }) {
  if (item.disabled) {
    return (
      <span className={styles.linkDisabled} aria-disabled="true">
        {item.label}
        <span className={styles.badge}>Phase 2+</span>
      </span>
    );
  }
  return (
    <Link href={item.href} className={styles.link}>
      {item.label}
    </Link>
  );
}

export function SideRail() {
  return (
    <aside className={styles.rail} aria-label="Primary navigation">
      <div className={styles.brand}>
        <span className={styles.brandGlyph}>N</span>
        <span className={styles.brandWord}>Namecard</span>
      </div>

      <nav aria-label="Primary">
        <p className={styles.navLabel}>導覽</p>
        <ul className={styles.navList}>
          {PRIMARY.map((item) => (
            <li key={item.label}>
              <NavLink item={item} />
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Secondary" className={styles.secondary}>
        <p className={styles.navLabel}>資料</p>
        <ul className={styles.navList}>
          {SECONDARY.map((item) => (
            <li key={item.label}>
              <NavLink item={item} />
            </li>
          ))}
        </ul>
      </nav>

      <footer className={styles.footer}>
        <p className={styles.footerCopy}>Phase 1 Foundation</p>
        <p className={styles.footerMeta}>以關係脈絡為核心</p>
      </footer>
    </aside>
  );
}
