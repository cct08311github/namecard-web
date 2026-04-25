"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { mergeCardsAction } from "@/app/(app)/cards/actions";
import type { CardSummary } from "@/db/cards";
import type { DuplicateGroup } from "@/lib/cards/duplicates";

import styles from "./MergeGroup.module.css";

interface MergeGroupProps {
  group: DuplicateGroup;
}

function reasonLabel(reason: DuplicateGroup["reason"]): string {
  return reason === "email-match" ? "共用 Email" : "同名同公司";
}

function cardDisplayName(card: CardSummary): string {
  return card.nameZh || card.nameEn || "（未命名）";
}

function cardSubline(card: CardSummary): string {
  const role = card.jobTitleZh || card.jobTitleEn;
  const company = card.companyZh || card.companyEn;
  return [role, company].filter(Boolean).join(" · ");
}

function formatYmd(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("zh-Hant", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function MergeGroup({ group }: MergeGroupProps) {
  const router = useRouter();
  const [keepId, setKeepId] = useState(group.cards[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ merged: number } | null>(null);

  const mergeIds = useMemo(
    () => group.cards.filter((c) => c.id !== keepId).map((c) => c.id),
    [group.cards, keepId],
  );

  function handleMerge() {
    setError(null);
    startTransition(async () => {
      const res = await mergeCardsAction({ keepId, mergeIds });
      if (res?.serverError) {
        setError(res.serverError);
        return;
      }
      if (res?.validationErrors) {
        setError("輸入格式有問題，請重試");
        return;
      }
      const merged = res?.data?.merged ?? mergeIds.length;
      setDone({ merged });
      router.refresh();
    });
  }

  if (done) {
    const keepCard = group.cards.find((c) => c.id === keepId);
    return (
      <section className={styles.group} aria-live="polite">
        <p className={styles.doneMsg}>
          ✅ 已合併 {done.merged} 張到{" "}
          <Link href={`/cards/${keepId}`} className={styles.doneLink}>
            {keepCard ? cardDisplayName(keepCard) : "保留卡"}
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className={styles.group}>
      <header className={styles.header}>
        <span className={styles.badge}>{reasonLabel(group.reason)}</span>
        <span className={styles.count}>{group.cards.length} 張可能重複</span>
      </header>

      <p className={styles.hint}>選一張要保留的卡，其餘會合併進去：</p>

      <ul className={styles.cardList}>
        {group.cards.map((card) => {
          const isKeep = card.id === keepId;
          const phones = card.phones?.length ?? 0;
          const emails = card.emails?.length ?? 0;
          const tags = card.tagNames?.length ?? 0;
          return (
            <li key={card.id} className={isKeep ? styles.cardItemKeep : styles.cardItem}>
              <label className={styles.cardLabel}>
                <input
                  type="radio"
                  name={`keep-${group.id}`}
                  value={card.id}
                  checked={isKeep}
                  onChange={() => setKeepId(card.id)}
                  disabled={pending}
                />
                <div className={styles.cardBody}>
                  <div className={styles.cardName}>
                    <Link
                      href={`/cards/${card.id}`}
                      className={styles.cardNameLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {cardDisplayName(card)}
                    </Link>
                    {isKeep && <span className={styles.keepTag}>保留</span>}
                  </div>
                  {cardSubline(card) && (
                    <div className={styles.cardSubline}>{cardSubline(card)}</div>
                  )}
                  <div className={styles.cardMeta}>
                    建立：{formatYmd(card.createdAt)} · 上次互動：
                    {formatYmd(card.lastContactedAt)} · 電話 {phones} · Email {emails} · 標籤 {tags}
                  </div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.mergeBtn}
          onClick={handleMerge}
          disabled={pending || mergeIds.length === 0}
        >
          {pending ? "合併中…" : `合併其餘 ${mergeIds.length} 張到此卡`}
        </button>
        <span className={styles.helper}>
          被合併的卡會做軟刪除（電話／Email／標籤／備註會 union 到保留卡）
        </span>
      </div>
    </section>
  );
}
