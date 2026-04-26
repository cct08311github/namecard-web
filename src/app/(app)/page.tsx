import Link from "next/link";

import { DailyBriefingSection } from "@/components/coach/DailyBriefingSection";
import { OnboardingHero } from "@/components/home/OnboardingHero";
import { PwaInstallHint } from "@/components/home/PwaInstallHint";
import { TimelineSection } from "@/components/timeline/TimelineSection";
import { listCardsForUser } from "@/db/cards";
import { isCoachConfigured } from "@/lib/coach/llm";
import { readSession } from "@/lib/firebase/session";
import { categorizeTimeline } from "@/lib/timeline/categorize";

import styles from "./home.module.css";

export const metadata = {
  title: "時間軸",
};

export default async function HomePage() {
  const user = await readSession();
  if (!user) return null;

  const cards = await listCardsForUser(user.uid, {
    orderBy: "createdAt",
    order: "desc",
    limit: 200,
  });
  const sections = categorizeTimeline(cards, { now: new Date() });
  const totalInSections = sections.reduce((sum, section) => sum + section.cards.length, 0);
  const firstName = user.displayName?.split(" ")[0] ?? "";

  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>今日</p>
        <h1 className={styles.title}>
          {firstName ? `${firstName}，` : ""}
          <em>今天</em>該問候誰？
        </h1>
        <p className={styles.lead}>
          把「關係脈絡」放在第一位—— 這裡不是名片列表，是你的人脈節奏表。
        </p>
        {cards.length > 0 && (
          <div className={styles.quickActions}>
            <Link href="/log" className={styles.quickAction}>
              🗣️ 對話速記
            </Link>
            <Link href="/cards/voice" className={styles.quickAction}>
              🎙️ 語音建卡
            </Link>
          </div>
        )}
      </header>

      {cards.length === 0 ? (
        <OnboardingHero />
      ) : totalInSections === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>
            所有名片都在本月之外的日期、近期也都有聯絡—— 先回到<Link href="/cards">名片冊</Link>
            看全部。
          </p>
        </div>
      ) : (
        <>
          {isCoachConfigured() && cards.length >= 3 && <DailyBriefingSection />}
          <div className={styles.sections}>
            {sections.map((section) => (
              <TimelineSection key={section.id} section={section} />
            ))}
          </div>
        </>
      )}

      <PwaInstallHint />
    </article>
  );
}
