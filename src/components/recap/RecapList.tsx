import Link from "next/link";

import type { RecapGroup } from "@/lib/recap/group";

import styles from "./RecapList.module.css";

interface RecapListProps {
  groups: readonly RecapGroup[];
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function pickName(card: RecapGroup["items"][number]["card"]): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

export function RecapList({ groups }: RecapListProps) {
  return (
    <ol className={styles.groupList}>
      {groups.map((group) => (
        <li key={group.key} className={styles.group}>
          <h2 className={styles.groupLabel}>{group.label}</h2>
          <ul className={styles.itemList}>
            {group.items.map((item) => (
              <li key={`${item.card.id}::${item.event.id}`} className={styles.item}>
                <span className={styles.time}>{formatTime(item.event.at)}</span>
                <div className={styles.body}>
                  <Link href={`/cards/${item.card.id}`} className={styles.name}>
                    {pickName(item.card)}
                  </Link>
                  <p className={styles.note}>{item.event.note || "（無內容）"}</p>
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
