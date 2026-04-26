"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  deleteCardAction,
  getFollowupSuggestionAction,
  logContactAction,
  setFollowUpAction,
  toggleCardPinAction,
} from "@/app/(app)/cards/actions";
import { localYmdAfterDays } from "@/lib/cards/follow-up-date";
import { shareCardVcard } from "@/lib/share/card-share";

import styles from "./CardActions.module.css";
import { VoiceMicButton } from "./VoiceMicButton";

interface PhoneEntry {
  label: string;
  value: string;
}
interface EmailEntry {
  label: string;
  value: string;
}

interface CardActionsProps {
  cardId: string;
  displayName?: string;
  /** Backwards-compat single-value prop. Prefer phones[]. */
  primaryPhone?: string;
  /** Backwards-compat single-value prop. Prefer emails[]. */
  primaryEmail?: string;
  /**
   * Full phone list. When >1, the 📞 quick CTA becomes a picker.
   * Falls back to primaryPhone when omitted.
   */
  phones?: PhoneEntry[];
  emails?: EmailEntry[];
  lineId?: string;
  linkedinUrl?: string;
  isPinned?: boolean;
  /** Existing follow-up reminder, if any. ISO YYYY-MM-DD string for input parity. */
  followUpAt?: string | null;
}

export function CardActions({
  cardId,
  displayName,
  primaryPhone,
  primaryEmail,
  phones,
  emails,
  lineId,
  linkedinUrl,
  isPinned = false,
  followUpAt = null,
}: CardActionsProps) {
  // Normalize: prefer the full list when given, else wrap the single
  // primary into a 1-item list. Empty when there's nothing to show.
  const phoneList: PhoneEntry[] =
    phones?.filter((p) => p.value) ??
    (primaryPhone ? [{ label: "phone", value: primaryPhone }] : []);
  const emailList: EmailEntry[] =
    emails?.filter((e) => e.value) ??
    (primaryEmail ? [{ label: "email", value: primaryEmail }] : []);
  const [phonePickerOpen, setPhonePickerOpen] = useState(false);
  const [emailPickerOpen, setEmailPickerOpen] = useState(false);
  const [copyPickerOpen, setCopyPickerOpen] = useState<"phone" | "email" | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [logNoteOpen, setLogNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState(followUpAt ?? "");
  const [suggestionHint, setSuggestionHint] = useState<string | null>(null);

  const requestFollowupSuggestion = () => {
    setSuggestionHint(null);
    startTransition(async () => {
      const res = await getFollowupSuggestionAction({ cardId });
      if (!res?.data || !res.data.ok) {
        setSuggestionHint("無法取得建議");
        return;
      }
      setFollowUpDraft(res.data.suggestion.isoDate);
      setSuggestionHint(res.data.suggestion.reasonZh);
    });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleTouch = () => {
    // First click: reveal the note input. User can type a note and submit,
    // or click 「跳過備註」 to log an empty event. This keeps 1-click
    // behavior cheap while making the log meaningful when content matters.
    if (!logNoteOpen) {
      setLogNoteOpen(true);
      return;
    }
    submitLog(noteDraft);
  };

  const submitLog = (note: string) => {
    setError(null);
    startTransition(async () => {
      const result = await logContactAction({ id: cardId, note });
      if (result?.serverError) setError(result.serverError);
      else {
        setToast(note.trim() ? "已記錄互動" : "已標記聯絡");
        setLogNoteOpen(false);
        setNoteDraft("");
        router.refresh();
      }
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

  const submitFollowUp = (date: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await setFollowUpAction({ id: cardId, followUpAt: date });
      if (result?.serverError) setError(result.serverError);
      else {
        setToast(date ? `已排提醒：${date}` : "已取消提醒");
        setFollowUpOpen(false);
        setFollowUpDraft(date ?? "");
        router.refresh();
      }
    });
  };

  const handleTogglePin = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleCardPinAction({ id: cardId, pinned: !isPinned });
      if (result?.serverError) setError(result.serverError);
      else {
        setToast(isPinned ? "已取消置頂" : "已加入重要聯絡人");
        router.refresh();
      }
    });
  };

  const handleShare = async () => {
    setError(null);
    try {
      const outcome = await shareCardVcard(cardId, displayName ?? "名片");
      if (outcome === "shared") setToast("已分享");
      else if (outcome === "downloaded") setToast("已下載 vCard");
      // "cancelled" → user dismissed the share sheet; no toast.
    } catch {
      setToast("分享失敗，已改為下載");
    }
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast(`已複製${label}`);
    } catch {
      setToast("複製失敗");
    }
  };

  // LINE deep-link: older LINE IDs (@foo) use line://ti/p/@foo, user IDs
  // without @ use ~{id}. Both open the LINE app when present.
  const lineHref = lineId
    ? `https://line.me/ti/p/${lineId.startsWith("@") ? encodeURIComponent(lineId) : `~${encodeURIComponent(lineId)}`}`
    : null;

  return (
    <section className={styles.actions} aria-label="Actions">
      <p className={styles.title}>快速動作</p>

      {/* Primary CTAs — 商務人士最常觸發的四個動作 */}
      <div className={styles.quick}>
        <ChannelQuickButton
          icon="📞"
          label="電話"
          entries={phoneList}
          scheme="tel"
          open={phonePickerOpen}
          onToggle={() => setPhonePickerOpen((v) => !v)}
          onClose={() => setPhonePickerOpen(false)}
        />
        <ChannelQuickButton
          icon="📧"
          label="Email"
          entries={emailList}
          scheme="mailto"
          open={emailPickerOpen}
          onToggle={() => setEmailPickerOpen((v) => !v)}
          onClose={() => setEmailPickerOpen(false)}
        />
        {lineHref ? (
          <a
            href={lineHref}
            className={styles.quickButton}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="開啟 LINE"
          >
            <span className={styles.quickIcon} aria-hidden="true">
              💬
            </span>
            <span className={styles.quickLabel}>LINE</span>
          </a>
        ) : (
          <span className={`${styles.quickButton} ${styles.quickDisabled}`} aria-disabled="true">
            <span className={styles.quickIcon} aria-hidden="true">
              💬
            </span>
            <span className={styles.quickLabel}>LINE</span>
          </span>
        )}
        <button
          type="button"
          className={`${styles.quickButton} ${styles.quickPrimary}`}
          onClick={handleTouch}
          disabled={pending}
          aria-label="記錄為已聯絡"
          aria-expanded={logNoteOpen}
        >
          <span className={styles.quickIcon} aria-hidden="true">
            ✅
          </span>
          <span className={styles.quickLabel}>
            {pending ? "記錄中…" : logNoteOpen ? "記錄" : "已聯絡"}
          </span>
        </button>
      </div>

      {logNoteOpen && (
        <div className={styles.noteBox}>
          <textarea
            className={styles.noteInput}
            placeholder="寫一句互動摘要（可留空）"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={2}
            autoFocus
            aria-label="互動備註（500 字以內）"
          />
          <VoiceMicButton
            onFinalTranscript={(t) =>
              setNoteDraft((prev) => (prev ? `${prev}${t}` : t).slice(0, 500))
            }
            disabled={pending}
          />
          <div className={styles.noteActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => submitLog("")}
              disabled={pending}
            >
              跳過備註
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setLogNoteOpen(false);
                setNoteDraft("");
              }}
              disabled={pending}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Copy-to-clipboard row — 商務常需快速複製貼到其他 app */}
      {(emailList.length > 0 || phoneList.length > 0) && (
        <div className={styles.copyRow}>
          {emailList.length > 0 && (
            <CopyButton
              label="複製 Email"
              valueLabel=" email"
              entries={emailList}
              open={copyPickerOpen === "email"}
              onToggle={() => setCopyPickerOpen((c) => (c === "email" ? null : "email"))}
              onClose={() => setCopyPickerOpen(null)}
              onCopy={(value, label) => copyToClipboard(value, label)}
            />
          )}
          {phoneList.length > 0 && (
            <CopyButton
              label="複製電話"
              valueLabel="電話"
              entries={phoneList}
              open={copyPickerOpen === "phone"}
              onToggle={() => setCopyPickerOpen((c) => (c === "phone" ? null : "phone"))}
              onClose={() => setCopyPickerOpen(null)}
              onCopy={(value, label) => copyToClipboard(value, label)}
            />
          )}
        </div>
      )}

      <div className={styles.stack}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setFollowUpOpen((v) => !v)}
          disabled={pending}
          aria-expanded={followUpOpen}
        >
          {followUpAt ? `📅 下次聯絡：${followUpAt}` : "📅 設定下次聯絡"}
        </button>
        {followUpOpen && (
          <div className={styles.noteBox}>
            <input
              type="date"
              className={styles.noteInput}
              value={followUpDraft}
              onChange={(e) => setFollowUpDraft(e.target.value)}
              aria-label="下次聯絡日期"
              min={localYmdAfterDays(0)}
            />
            <div className={styles.noteActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => submitFollowUp(localYmdAfterDays(3))}
                disabled={pending}
              >
                +3 天
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => submitFollowUp(localYmdAfterDays(7))}
                disabled={pending}
              >
                +7 天
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => submitFollowUp(localYmdAfterDays(14))}
                disabled={pending}
              >
                +14 天
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={requestFollowupSuggestion}
                disabled={pending}
                title="根據對話節奏 AI 建議下次聯絡日"
              >
                ✨ AI 建議
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => submitFollowUp(followUpDraft || null)}
                disabled={pending || !followUpDraft}
              >
                確認日期
              </button>
              {followUpAt && (
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => submitFollowUp(null)}
                  disabled={pending}
                >
                  取消提醒
                </button>
              )}
            </div>
            {suggestionHint && <p className={styles.hint}>{suggestionHint}</p>}
          </div>
        )}
        <button
          type="button"
          className={styles.secondary}
          onClick={handleTogglePin}
          disabled={pending}
          aria-pressed={isPinned}
        >
          {isPinned ? "📍 已置頂（取消）" : "📌 設為重要聯絡人"}
        </button>
        <button type="button" className={styles.secondary} onClick={handleShare}>
          📤 分享名片
        </button>
        <a href={`/api/cards/${cardId}/vcard`} className={styles.secondary}>
          匯出 vCard
        </a>
        {linkedinUrl && (
          <a
            href={linkedinUrl}
            className={styles.secondary}
            target="_blank"
            rel="noreferrer noopener"
          >
            開啟 LinkedIn ↗
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

      {toast && (
        <p role="status" aria-live="polite" className={styles.toast}>
          {toast}
        </p>
      )}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}

interface ChannelQuickButtonProps {
  icon: string;
  label: string;
  entries: PhoneEntry[];
  scheme: "tel" | "mailto";
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function ChannelQuickButton({
  icon,
  label,
  entries,
  scheme,
  open,
  onToggle,
  onClose,
}: ChannelQuickButtonProps) {
  if (entries.length === 0) {
    return (
      <span className={`${styles.quickButton} ${styles.quickDisabled}`} aria-disabled="true">
        <span className={styles.quickIcon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.quickLabel}>{label}</span>
      </span>
    );
  }
  if (entries.length === 1) {
    const e = entries[0];
    return (
      <a
        href={`${scheme}:${e.value}`}
        className={styles.quickButton}
        aria-label={`${label} ${e.value}`}
      >
        <span className={styles.quickIcon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.quickLabel}>{label}</span>
      </a>
    );
  }
  return (
    <div className={styles.pickerWrap}>
      <button
        type="button"
        className={styles.quickButton}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} (${entries.length} 個選項)`}
      >
        <span className={styles.quickIcon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.quickLabel}>{label} ▾</span>
      </button>
      {open && (
        <ChannelPicker
          entries={entries}
          renderHref={(e) => `${scheme}:${e.value}`}
          onClose={onClose}
        />
      )}
    </div>
  );
}

interface CopyButtonProps {
  label: string;
  valueLabel: string;
  entries: PhoneEntry[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onCopy: (value: string, label: string) => void;
}

function CopyButton({
  label,
  valueLabel,
  entries,
  open,
  onToggle,
  onClose,
  onCopy,
}: CopyButtonProps) {
  if (entries.length === 1) {
    const e = entries[0];
    return (
      <button
        type="button"
        className={styles.secondary}
        onClick={() => onCopy(e.value, valueLabel)}
      >
        {label}
      </button>
    );
  }
  return (
    <div className={styles.pickerWrap}>
      <button
        type="button"
        className={styles.secondary}
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} ▾
      </button>
      {open && (
        <ChannelPicker
          entries={entries}
          onSelect={(e) => {
            onCopy(e.value, valueLabel);
            onClose();
          }}
          onClose={onClose}
        />
      )}
    </div>
  );
}

interface ChannelPickerProps {
  entries: PhoneEntry[];
  renderHref?: (e: PhoneEntry) => string;
  onSelect?: (e: PhoneEntry) => void;
  onClose: () => void;
}

function ChannelPicker({ entries, renderHref, onSelect, onClose }: ChannelPickerProps) {
  // Close on Escape; outside-click handled by absolute backdrop.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className={styles.pickerBackdrop} onClick={onClose} aria-hidden="true" />
      <ul role="menu" className={styles.pickerMenu}>
        {entries.map((e, i) => {
          const inner = (
            <>
              <span className={styles.pickerLabel}>{e.label}</span>
              <span className={styles.pickerValue}>{e.value}</span>
            </>
          );
          return (
            <li key={`${e.label}-${i}`} role="menuitem">
              {renderHref ? (
                <a href={renderHref(e)} className={styles.pickerItem} onClick={onClose}>
                  {inner}
                </a>
              ) : (
                <button type="button" className={styles.pickerItem} onClick={() => onSelect?.(e)}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
