import Link from "next/link";

import styles from "./OnboardingHero.module.css";

interface PathCardData {
  href: string;
  emoji: string;
  title: string;
  description: string;
  cta: string;
  emphasis?: boolean;
}

const PATHS: PathCardData[] = [
  {
    href: "/cards/voice",
    emoji: "🎙️",
    title: "語音建卡",
    description: "30 秒講出剛遇到的人，AI 幫你抽出姓名、職稱、公司",
    cta: "開始說話",
    emphasis: true,
  },
  {
    href: "/cards/scan",
    emoji: "📷",
    title: "拍實體名片",
    description: "OCR 掃描，自動填欄位 — 適合剛從 networking event 回來",
    cta: "上傳照片",
  },
  {
    href: "/cards/new",
    emoji: "✏️",
    title: "手動建立",
    description: "一字一字打 — 最簡單、最熟悉",
    cta: "新增表單",
  },
  {
    href: "/import",
    emoji: "📥",
    title: "vCard / CSV / LinkedIn 匯入",
    description: "已經在別處有名單？一次匯入幾百筆",
    cta: "匯入聯絡人",
  },
];

/**
 * First-run hero on the home page when the user has zero cards. Surfaces
 * the four capture paths side-by-side instead of forcing them through a
 * single CTA — different users prefer different on-ramps and we want to
 * show that choice immediately rather than buried in nav.
 */
export function OnboardingHero() {
  return (
    <section className={styles.hero} aria-labelledby="onboarding-hero-title">
      <header className={styles.heroHeader}>
        <p className={styles.kicker}>第一張名片</p>
        <h2 id="onboarding-hero-title" className={styles.title}>
          選你<em>最快</em>的方式開始
        </h2>
        <p className={styles.lead}>
          這個工具的核心不是名片儲存，是<em>關係的脈絡</em> ——
          每張卡都會記下「為什麼記得這個人」、之後的對話、AI 推薦下一步。 從一張卡開始就好。
        </p>
      </header>
      <ul className={styles.grid}>
        {PATHS.map((p) => (
          <li key={p.href}>
            <Link href={p.href} className={p.emphasis ? styles.cardEmphasis : styles.card}>
              <span className={styles.emoji} aria-hidden="true">
                {p.emoji}
              </span>
              <span className={styles.cardTitle}>{p.title}</span>
              <span className={styles.description}>{p.description}</span>
              <span className={styles.cta}>{p.cta} →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
