"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { TagSummary } from "@/db/tags";
import { DEFAULT_TAG_COLOR, TAG_PALETTE } from "@/lib/tags/palette";

import { createTagAction, deleteTagAction, recolorTagAction, renameTagAction } from "./actions";
import styles from "./tags.module.css";

interface TagsClientProps {
  tags: TagSummary[];
}

/**
 * Tag list + inline rename + color pick + delete. Each row owns its
 * own optimistic edit state; useTransition keeps the UI responsive
 * during the batched reindex (which can take a second or two for
 * 400+ cards).
 */
export function TagsClient({ tags }: TagsClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLOR);
  const [filter, setFilter] = useState("");

  const filteredTags = (() => {
    const lower = filter.trim().toLowerCase();
    if (!lower) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(lower));
  })();

  function runWithRefresh(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function onCreate() {
    const name = newTagName.trim();
    if (!name) return;
    const color = newTagColor;
    runWithRefresh(async () => {
      await createTagAction({ name, color });
      setNewTagName("");
    });
  }

  return (
    <>
      {tags.length === 0 ? (
        <p className={styles.empty}>還沒有標籤。先新增一個吧。</p>
      ) : (
        <>
          <div className={styles.filterRow}>
            <input
              type="search"
              className={styles.filterInput}
              placeholder="搜尋標籤…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="搜尋標籤"
            />
            {filter && (
              <span className={styles.filterCount}>
                {filteredTags.length} / {tags.length}
              </span>
            )}
          </div>
          {filteredTags.length === 0 ? (
            <p className={styles.empty}>沒有符合「{filter}」的標籤</p>
          ) : (
            <ul className={styles.list}>
              {filteredTags.map((tag) => (
                <TagRow key={tag.id} tag={tag} disabled={pending} onDone={() => router.refresh()} />
              ))}
            </ul>
          )}
        </>
      )}

      <div className={styles.createRow}>
        <span className={styles.swatch} style={{ background: newTagColor }} aria-hidden="true" />
        <input
          className={styles.createInput}
          placeholder="新增標籤（例：COMPUTEX 2024）"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
          }}
          maxLength={60}
        />
        <TagColorPicker value={newTagColor} onChange={setNewTagColor} />
        <button
          type="button"
          className={styles.createBtn}
          onClick={onCreate}
          disabled={pending || !newTagName.trim()}
        >
          新增
        </button>
      </div>
    </>
  );
}

function TagRow({
  tag,
  disabled,
  onDone,
}: {
  tag: TagSummary;
  disabled: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [rowPending, startRow] = useTransition();

  function commitRename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === tag.name) return;
    startRow(async () => {
      await renameTagAction({ id: tag.id, name: trimmed });
      onDone();
    });
  }

  function commitColor(next: string) {
    if (next === color) return;
    setColor(next);
    startRow(async () => {
      await recolorTagAction({ id: tag.id, color: next });
      onDone();
    });
  }

  function onDelete() {
    startRow(async () => {
      await deleteTagAction({ id: tag.id });
      onDone();
    });
  }

  const isBusy = disabled || rowPending;

  return (
    <li className={styles.row}>
      <span className={styles.swatch} style={{ background: color }} aria-hidden="true" />
      <input
        className={styles.name}
        value={name}
        disabled={isBusy}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setName(tag.name);
        }}
        maxLength={60}
        aria-label={`Tag name for ${tag.name}`}
      />
      <TagColorPicker value={color} onChange={commitColor} disabled={isBusy} />
      <button
        type="button"
        className={styles.deleteBtn}
        onClick={onDelete}
        disabled={isBusy}
        aria-label={`Delete tag ${tag.name}`}
      >
        刪除
      </button>
    </li>
  );
}

function TagColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (c: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.colorPicker} role="radiogroup" aria-label="Tag color">
      {TAG_PALETTE.map((p) => (
        <button
          key={p.id}
          type="button"
          className={styles.colorChip}
          style={{ background: p.oklch }}
          onClick={() => onChange(p.oklch)}
          aria-label={p.label}
          aria-pressed={value === p.oklch}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
