"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CardGallery } from "@/components/cards/CardGallery";
import { CardList } from "@/components/cards/CardList";
import {
  bulkLogContactAction,
  bulkSoftDeleteCardsAction,
  bulkUpdateCardsAction,
} from "@/app/(app)/cards/actions";
import type { CardSummary } from "@/db/cards";
import type { TagSummary } from "@/db/tags";

import styles from "./CardsSelectionShell.module.css";
import { useCardSelection } from "./useCardSelection";

type View = "gallery" | "list";

interface CardsSelectionShellProps {
  cards: CardSummary[];
  view: View;
  tags: TagSummary[];
  /** Optional cardId → signed-URL map for thumbnail rendering. */
  imageUrls?: Record<string, string>;
}

/**
 * Wraps the gallery/list view with a multi-select toggle + floating
 * bulk-action toolbar. Toolbar appears only when selection mode is on.
 *
 * Selection state stays in this component — by design page navigation
 * (sort change / pagination) clears selection. Cross-page persistence
 * was deliberately scoped out; users have only one page of cards.
 */
export function CardsSelectionShell({ cards, view, tags, imageUrls }: CardsSelectionShellProps) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddTag, setShowAddTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [showSetEvent, setShowSetEvent] = useState(false);
  const [eventDraft, setEventDraft] = useState("");
  const [showBulkLog, setShowBulkLog] = useState(false);
  const [bulkLogDraft, setBulkLogDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selection = useCardSelection();
  const allIds = cards.map((c) => c.id);
  const allSelected = selection.count > 0 && selection.count === allIds.length;

  function exitSelectMode() {
    setSelectMode(false);
    selection.clear();
    setShowAddTag(false);
    setShowSetEvent(false);
    setShowBulkLog(false);
    setBulkLogDraft("");
    setConfirmDelete(false);
    setError(null);
  }

  function flashToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  function applyBulk(input: Parameters<typeof bulkUpdateCardsAction>[0]) {
    setError(null);
    startTransition(async () => {
      const res = await bulkUpdateCardsAction(input);
      if (res?.serverError) setError(res.serverError);
      else if (res?.validationErrors) setError("輸入格式有問題");
      else {
        flashToast(`已更新 ${res?.data?.updated ?? 0} 張`);
        exitSelectMode();
        router.refresh();
      }
    });
  }

  function handleAddTag() {
    const name = tagDraft.trim();
    if (!name) return;
    const known = tags.find((t) => t.name === name);
    const patch: { addTagIds?: string[]; addTagNames?: string[] } = {};
    patch.addTagNames = [name];
    if (known) patch.addTagIds = [known.id];
    applyBulk({ ids: selection.selectedIds, patch });
  }

  function handleSetEvent() {
    applyBulk({
      ids: selection.selectedIds,
      patch: { setEventTag: eventDraft.trim() },
    });
  }

  function handleSetPin(pinned: boolean) {
    applyBulk({ ids: selection.selectedIds, patch: { setPinned: pinned } });
  }

  function handleBulkLog() {
    setError(null);
    startTransition(async () => {
      const res = await bulkLogContactAction({
        ids: selection.selectedIds,
        note: bulkLogDraft.trim(),
      });
      if (res?.serverError) {
        setError(res.serverError);
        return;
      }
      const data = res?.data;
      if (!data) {
        setError("送出失敗");
        return;
      }
      if (data.ok) {
        flashToast(`已記錄到 ${data.logged} 張`);
        exitSelectMode();
        router.refresh();
      } else {
        setError(`部分失敗：${data.reason}（已記錄 ${data.logged} 張）`);
      }
    });
  }

  function handleBulkDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await bulkSoftDeleteCardsAction({ ids: selection.selectedIds });
      if (res?.serverError) setError(res.serverError);
      else {
        flashToast(`已刪除 ${res?.data?.deleted ?? 0} 張`);
        exitSelectMode();
        router.refresh();
      }
    });
  }

  return (
    <div className={styles.shell}>
      <div className={styles.bar}>
        {selectMode ? (
          <>
            <span className={styles.barInfo}>
              已選 <strong>{selection.count}</strong> / {allIds.length}
            </span>
            <button
              type="button"
              className={styles.barLink}
              onClick={() => selection.setMany(allIds, !allSelected)}
            >
              {allSelected ? "取消全選" : "全選"}
            </button>
            <button type="button" className={styles.barLink} onClick={exitSelectMode}>
              離開選取模式
            </button>
          </>
        ) : (
          <button type="button" className={styles.barLink} onClick={() => setSelectMode(true)}>
            ☑ 選取模式
          </button>
        )}
      </div>

      {view === "gallery" ? (
        <CardGallery
          cards={cards}
          selection={selectMode ? selection : undefined}
          imageUrls={imageUrls}
        />
      ) : (
        <CardList
          cards={cards}
          selection={selectMode ? selection : undefined}
          imageUrls={imageUrls}
        />
      )}

      {selectMode && selection.count > 0 && (
        <div className={styles.toolbar} role="toolbar" aria-label="批次動作">
          {showAddTag ? (
            <div className={styles.actionRow}>
              <input
                type="text"
                className={styles.input}
                placeholder="標籤名（既有或新建）"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value.slice(0, 60))}
                list="bulk-tag-suggestions"
                autoFocus
              />
              <datalist id="bulk-tag-suggestions">
                {tags.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
              <button
                type="button"
                className={styles.primary}
                onClick={handleAddTag}
                disabled={pending || !tagDraft.trim()}
              >
                加到 {selection.count} 張
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setShowAddTag(false);
                  setTagDraft("");
                }}
              >
                取消
              </button>
            </div>
          ) : showBulkLog ? (
            <div className={styles.actionRow}>
              <input
                type="text"
                className={styles.input}
                placeholder="一筆 note，套用到 N 張卡（可留空只 mark 為已聯絡）"
                value={bulkLogDraft}
                onChange={(e) => setBulkLogDraft(e.target.value.slice(0, 500))}
                maxLength={500}
                autoFocus
              />
              <button
                type="button"
                className={styles.primary}
                onClick={handleBulkLog}
                disabled={pending}
              >
                記錄到 {selection.count} 張
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setShowBulkLog(false);
                  setBulkLogDraft("");
                }}
              >
                取消
              </button>
            </div>
          ) : showSetEvent ? (
            <div className={styles.actionRow}>
              <input
                type="text"
                className={styles.input}
                placeholder="場合，例如「2024 COMPUTEX」"
                value={eventDraft}
                onChange={(e) => setEventDraft(e.target.value.slice(0, 100))}
                autoFocus
              />
              <button
                type="button"
                className={styles.primary}
                onClick={handleSetEvent}
                disabled={pending}
              >
                套用到 {selection.count} 張
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setShowSetEvent(false);
                  setEventDraft("");
                }}
              >
                取消
              </button>
            </div>
          ) : (
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setShowBulkLog(true)}
                disabled={pending}
                title="把同一筆 note 記錄到所有選中的卡（適合「剛開完同場 event」）"
              >
                ✅ 記錄互動
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setShowAddTag(true)}
                disabled={pending}
              >
                + 加標籤
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setShowSetEvent(true)}
                disabled={pending}
              >
                ＠ 設場合
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => handleSetPin(true)}
                disabled={pending}
              >
                📍 置頂
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => handleSetPin(false)}
                disabled={pending}
              >
                取消置頂
              </button>
              <button
                type="button"
                className={`${styles.destructive} ${confirmDelete ? styles.armed : ""}`}
                onClick={handleBulkDelete}
                disabled={pending}
              >
                {confirmDelete ? `確定刪除 ${selection.count} 張？` : "🗑 刪除"}
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </div>
      )}

      {toast && (
        <div role="status" aria-live="polite" className={styles.toast}>
          {toast}
        </div>
      )}
    </div>
  );
}
