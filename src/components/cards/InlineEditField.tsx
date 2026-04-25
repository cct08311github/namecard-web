"use client";

import { useId, useRef, useState } from "react";

import styles from "./InlineEditField.module.css";

interface InlineEditFieldProps {
  /** Current value. Empty / undefined renders as the placeholder. */
  value: string | undefined;
  /** Called with the trimmed new value when the user commits via Enter / blur. */
  onSave: (value: string) => Promise<void>;
  /** Inline placeholder shown when value is empty. */
  placeholder: string;
  /** ARIA label for screen readers ("名字"、"職稱" 等). */
  ariaLabel: string;
  /** Render as <textarea> instead of <input>. Adds Cmd/Ctrl+Enter to commit. */
  multiline?: boolean;
  /** Soft cap; the input enforces it via maxLength. */
  maxLength?: number;
  /** Style override hook for parent (e.g. h1 / blockquote vs span). */
  className?: string;
  /** Disable the inline edit affordance entirely (still renders the value). */
  disabled?: boolean;
}

/**
 * Hover-to-reveal inline editor. Click to edit, Enter / blur to save,
 * Esc to cancel. Multiline mode uses Cmd/Ctrl+Enter so plain Enter
 * keeps inserting newlines.
 *
 * Nothing is shown unless this component is in either `display` or
 * `editing` mode — the wrapper is always rendered, so screen readers
 * still see the value via aria-label.
 */
export function InlineEditField({
  value,
  onSave,
  placeholder,
  ariaLabel,
  multiline = false,
  maxLength = 200,
  className,
  disabled = false,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const fieldId = useId();

  const startEdit = () => {
    if (disabled || pending) return;
    setDraft(value ?? "");
    setEditing(true);
    setError(null);
    // Move focus + cursor to end on next tick.
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      try {
        el.setSelectionRange(end, end);
      } catch {
        // setSelectionRange is unsupported on some input types — ignore.
      }
    }, 0);
  };

  const commit = async () => {
    const next = draft.trim();
    const current = (value ?? "").trim();
    if (next === current) {
      setEditing(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setPending(false);
    }
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === "Enter") {
      // Multi-line: only Cmd/Ctrl+Enter commits, plain Enter inserts newline.
      if (multiline && !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      void commit();
    }
  };

  if (editing) {
    const InputTag = multiline ? "textarea" : "input";
    return (
      <span className={styles.editing}>
        <InputTag
          id={fieldId}
          ref={inputRef as never}
          className={`${styles.input} ${className ?? ""}`}
          value={draft}
          onChange={(e) => setDraft((e.target as HTMLInputElement).value)}
          onBlur={() => void commit()}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          aria-label={ariaLabel}
          disabled={pending}
          rows={multiline ? 3 : undefined}
        />
        {pending && <span className={styles.spinner} aria-label="儲存中" />}
        {error && (
          <span role="alert" className={styles.error}>
            {error}
          </span>
        )}
      </span>
    );
  }

  const display = value && value.trim() ? value : placeholder;
  const isEmpty = !value || !value.trim();

  return (
    <span
      className={`${styles.display} ${isEmpty ? styles.displayEmpty : ""} ${className ?? ""}`}
      onClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEdit();
        }
      }}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      aria-label={`${ariaLabel}：${value || placeholder}（點擊編輯）`}
      title={disabled ? undefined : "點擊編輯"}
    >
      {display}
      {!disabled && (
        <span className={styles.pencil} aria-hidden="true">
          ✏️
        </span>
      )}
    </span>
  );
}
