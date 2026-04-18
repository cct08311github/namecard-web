"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { createTagAction } from "@/app/(app)/tags/actions";

import styles from "./TagInput.module.css";

export interface TagOption {
  id: string;
  name: string;
  color?: string;
}

interface TagInputProps {
  /** Selected tag ids (RHF-controlled). */
  value: string[];
  /** Selected tag names, kept parallel to `value` for denormalization. */
  nameValue: string[];
  /** Commit both arrays back to RHF. Always called with the SAME length pair. */
  onChange: (tagIds: string[], tagNames: string[]) => void;
  /** Optional pre-fetched list so the combobox opens without a network hop. */
  initialOptions?: TagOption[];
  /** Disable interaction (e.g. while submitting). */
  disabled?: boolean;
}

/**
 * Multi-select tag combobox. Loads suggestions from `/api/tags` on first
 * focus and caches them for the lifetime of the component. Typing filters
 * suggestions; pressing Enter on an unmatched term inline-creates a new
 * tag via `createTagAction` and attaches it.
 *
 * Keeps tagIds + tagNames arrays in parallel so the rename propagation
 * path in `db/tags.ts` stays correct.
 */
export function TagInput({ value, nameValue, onChange, initialOptions, disabled }: TagInputProps) {
  const [options, setOptions] = useState<TagOption[]>(initialOptions ?? []);
  const [loaded, setLoaded] = useState(Boolean(initialOptions));
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const loadOptions = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await fetch("/api/tags", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { tags: TagOption[] };
      setOptions(body.tags);
      setLoaded(true);
    } catch {
      // Silent — keep combobox usable with whatever initialOptions we had.
      setLoaded(true);
    }
  }, [loaded]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedIds = useMemo(() => new Set(value), [value]);

  const matches = useMemo(() => {
    const query = draft.trim().toLowerCase();
    const pool = options.filter((o) => !selectedIds.has(o.id));
    if (!query) return pool.slice(0, 8);
    return pool.filter((o) => o.name.toLowerCase().includes(query)).slice(0, 8);
  }, [options, draft, selectedIds]);

  const exactMatch = matches.find((o) => o.name === draft.trim());
  const canCreate = draft.trim().length > 0 && !exactMatch && !creating;

  function addExisting(option: TagOption) {
    if (selectedIds.has(option.id)) return;
    onChange([...value, option.id], [...nameValue, option.name]);
    setDraft("");
  }

  function removeAt(idx: number) {
    onChange(
      value.filter((_, i) => i !== idx),
      nameValue.filter((_, i) => i !== idx),
    );
  }

  async function createAndAdd() {
    const name = draft.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await createTagAction({ name });
      const id = result?.data?.id;
      if (!id) return;
      const newOption: TagOption = { id, name };
      setOptions((prev) => (prev.some((p) => p.id === id) ? prev : [...prev, newOption]));
      addExisting(newOption);
    } finally {
      setCreating(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (exactMatch) addExisting(exactMatch);
      else if (canCreate) void createAndAdd();
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeAt(value.length - 1);
    }
    if (e.key === "Escape") {
      setOpen(false);
      setDraft("");
    }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.chipRow}>
        {value.map((id, idx) => (
          <span key={id} className={styles.chip}>
            <span>{nameValue[idx] ?? id}</span>
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => removeAt(idx)}
              disabled={disabled}
              aria-label={`Remove ${nameValue[idx] ?? id}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className={styles.input}
          value={draft}
          disabled={disabled}
          placeholder={value.length === 0 ? "新增標籤（Enter 建立）" : ""}
          onFocus={() => {
            setOpen(true);
            void loadOptions();
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          maxLength={60}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
        />
      </div>
      {open && (matches.length > 0 || canCreate) && (
        <ul id={listboxId} className={styles.suggestList} role="listbox">
          {matches.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={styles.suggestItem}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addExisting(o);
                }}
              >
                {o.color && <span className={styles.chipSwatch} style={{ background: o.color }} />}
                {o.name}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                className={`${styles.suggestItem} ${styles.createItem}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void createAndAdd();
                }}
              >
                {`+ 建立「${draft.trim()}」`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
