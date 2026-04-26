import type { AggregatedStats } from "./aggregate";

const SYSTEM_PROMPT =
  "你是商務人脈週報官。" +
  "使用者把這週關於人脈關係的數據給你 — 對話次數、新增名片、連續 streak、" +
  "溫度分布、本月最常聊到的人。" +
  "用 1-2 句話總結這週的關係動態。\n" +
  "規則：\n" +
  "- 用繁體中文，自然口吻，不要 bullet、不要 markdown、不要圍欄。\n" +
  "- 1-2 句話內，≤120 字。\n" +
  "- 若 streak ≥ 3 → 主動鼓勵 streak (例：「連續 X 天有 log，繼續保持」)。\n" +
  "- 若有 topPeople → 提到第一名 (例：「本月最常跟 Karen 聊」)。\n" +
  "- 若有 cold/quiet 大量 → 提醒 (例：「但有 N 位冷關係該 rekindle」)，但不要每次都講，只在 ≥ 3 個 cold 時才提。\n" +
  "- 不要編造數字 — 只用提供的數字。";

export function buildDigestMessages(
  stats: AggregatedStats,
): Array<{ role: "system" | "user"; content: string }> {
  const lines: string[] = [];
  lines.push(
    `本週 log: ${stats.thisWeek.logCount} 次 (${stats.thisWeek.distinctPeople} 位不同的人)`,
  );
  lines.push(`本週新增名片: ${stats.thisWeek.newCardCount}`);
  lines.push(
    `本月 log: ${stats.thisMonth.logCount} 次 (${stats.thisMonth.distinctPeople} 位不同的人)`,
  );
  lines.push(`本月新增名片: ${stats.thisMonth.newCardCount}`);
  lines.push(`連續 streak: ${stats.streak.current} 天 (歷史最長 ${stats.streak.longest} 天)`);
  lines.push(`名片總數: ${stats.totalCards}`);
  lines.push(
    `溫度分布: 🔥 ${stats.temperature.hot} / ✨ ${stats.temperature.warm} / 💫 ${stats.temperature.active} / 🌙 ${stats.temperature.quiet} / 💤 ${stats.temperature.cold}`,
  );
  if (stats.topPeople.length > 0) {
    const list = stats.topPeople
      .map((p) => `${p.card.nameZh || p.card.nameEn || "（未命名）"}（${p.logCount} 次）`)
      .join("、");
    lines.push(`本月 top: ${list}`);
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

const MAX_DIGEST_LEN = 600;

/**
 * Permissive parser. Output is prose, not structured. Strip fences,
 * trim, clamp. Returns "" on empty / non-string so caller can branch.
 */
export function parseDigest(raw: string): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const fenced = trimmed.match(/^```(?:\w*)?\s*([\s\S]*?)\s*```$/);
  const inner = fenced ? fenced[1]!.trim() : trimmed;
  return inner.slice(0, MAX_DIGEST_LEN);
}

/**
 * Cache marker — flips when any user-visible stat changes. Specifically
 * tracks the bits the LLM is summarizing, so a no-op page reload doesn't
 * reburn LLM credits. We do NOT include topPeople log counts (they
 * change daily) — instead use streak.current + total log count, which
 * already covers the "user did something today" signal.
 */
export function digestCacheMarker(stats: AggregatedStats): string {
  const topId = stats.topPeople[0]?.card.id ?? "";
  const tempSig = `${stats.temperature.hot}-${stats.temperature.warm}-${stats.temperature.active}-${stats.temperature.quiet}-${stats.temperature.cold}`;
  return [
    `wlc=${stats.thisWeek.logCount}`,
    `wnp=${stats.thisWeek.distinctPeople}`,
    `mnc=${stats.thisMonth.newCardCount}`,
    `s=${stats.streak.current}`,
    `t=${stats.totalCards}`,
    `tg=${tempSig}`,
    `tp=${topId}`,
  ].join("::");
}
