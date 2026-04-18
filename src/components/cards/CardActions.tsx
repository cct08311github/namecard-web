"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteCardAction, touchCardAction } from "@/app/(app)/cards/actions";

import styles from "./CardActions.module.css";

interface CardActionsProps {
  cardId: string;
  primaryPhone?: string;
  primaryEmail?: string;
}

export function CardActions({ cardId, primaryPhone, primaryEmail }: CardActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTouch = () => {
    setError(null);
    startTransition(async () => {
      const result = await touchCardAction({ id: cardId });
      if (result?.serverError) setError(result.serverError);
      else router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteCardAction({ id: cardId });
      if (result?.serverError) setError(result.serverError);
      else router.push("/cards");
    });
  };

  return (
    <section className={styles.actions} aria-label="Actions">
      <p className={styles.title}>動作</p>
      <div className={styles.stack}>
        <button type="button" className={styles.primary} onClick={handleTouch} disabled={pending}>
          {pending ? "記錄中…" : "標記：剛剛聯絡過"}
        </button>
        <a href={`/api/cards/${cardId}/vcard`} className={styles.secondary}>
          匯出 vCard
        </a>
        {primaryPhone && (
          <a href={`tel:${primaryPhone}`} className={styles.secondary}>
            撥打電話
          </a>
        )}
        {primaryEmail && (
          <a href={`mailto:${primaryEmail}`} className={styles.secondary}>
            寫 Email
          </a>
        )}
        <Link href={`/cards/${cardId}/edit`} className={styles.secondary}>
          編輯
        </Link>
        <button
          type="button"
          className={`${styles.destructive} ${confirming ? styles.destructiveArmed : ""}`}
          onClick={handleDelete}
          disabled={pending}
        >
          {confirming ? "確定要刪除嗎？" : "刪除名片"}
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
