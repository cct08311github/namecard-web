"use client";

import React, { useEffect, useCallback, useState } from "react";
import type { CanonicalCardField } from "@/lib/csv/linkedin";
import styles from "./FieldMappingDialog.module.css";

// ---------------------------------------------------------------------------
// Field labels (zh-TW)
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<CanonicalCardField, string> = {
  nameEn: "姓名（英）",
  firstName: "名",
  lastName: "姓",
  emailWork: "Email",
  companyEn: "公司",
  jobTitleEn: "職稱",
  firstMetDate: "首次見面",
  notes: "備註",
  ignored: "忽略",
};

const ALL_FIELDS: CanonicalCardField[] = [
  "ignored",
  "nameEn",
  "firstName",
  "lastName",
  "emailWork",
  "companyEn",
  "jobTitleEn",
  "firstMetDate",
  "notes",
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FieldMappingDialogProps {
  headers: string[];
  initialMapping: Record<string, CanonicalCardField>;
  onConfirm: (mapping: Record<string, CanonicalCardField>) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldMappingDialog({
  headers,
  initialMapping,
  onConfirm,
  onCancel,
}: FieldMappingDialogProps): React.JSX.Element {
  const [mapping, setMapping] = useState<Record<string, CanonicalCardField>>(() => ({
    ...initialMapping,
  }));

  // Keyboard: Esc → cancel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function handleSelectChange(header: string, value: string) {
    setMapping((prev) => ({ ...prev, [header]: value as CanonicalCardField }));
  }

  function handleConfirm() {
    onConfirm(mapping);
  }

  return (
    <div className={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-label="欄位對應設定" className={styles.dialog}>
        <header className={styles.header}>
          <h2 className={styles.title}>設定欄位對應</h2>
          <p className={styles.subtitle}>
            請為每個 CSV 欄位選擇對應的名片欄位，不需匯入的欄位請選「忽略」。
          </p>
        </header>

        <div className={styles.body}>
          {headers.map((header) => (
            <div key={header} className={styles.row}>
              <span className={styles.headerLabel} title={header}>
                {header}
              </span>
              <select
                className={styles.select}
                value={mapping[header] ?? "ignored"}
                onChange={(e) => handleSelectChange(header, e.target.value)}
                aria-label={`欄位對應：${header}`}
              >
                {ALL_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {FIELD_LABELS[field]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onCancel}>
            取消
          </button>
          <button type="button" className={styles.btnConfirm} onClick={handleConfirm}>
            確認匯入
          </button>
        </footer>
      </div>
    </div>
  );
}
