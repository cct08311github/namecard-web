import type { ContactEvent } from "@/db/cards";

import styles from "./ContactEventList.module.css";

interface ContactEventListProps {
  events: ContactEvent[];
}

/**
 * Render the contact-event log for a card, newest first. Designed to
 * sit beneath the main detail copy — 空狀態也印一行提示，讓 user 看到
 * 「這裡將出現互動紀錄」，不會突兀。
 */
export function ContactEventList({ events }: ContactEventListProps) {
  return (
    <section className={styles.section} aria-label="互動紀錄">
      <h2 className={styles.title}>互動紀錄</h2>
      {events.length === 0 ? (
        <p className={styles.empty}>還沒有互動紀錄。按「✅ 已聯絡」後會顯示在這裡。</p>
      ) : (
        <ol className={styles.list}>
          {events.map((e) => (
            <li key={e.id} className={styles.item}>
              <time className={styles.when} dateTime={e.at.toISOString()}>
                {formatDateTime(e.at)}
              </time>
              {e.note ? (
                <p className={styles.note}>{e.note}</p>
              ) : (
                <p className={styles.noteMuted}>（無備註）</p>
              )}
              {e.authorDisplay && <p className={styles.author}>— {e.authorDisplay}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Local-time-friendly format: 2026-04-24 09:30 (TW). Avoids Intl.DateTimeFormat
// timezone surprises on the server when we render at SSR time.
function formatDateTime(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da} ${h}:${m}`;
}
