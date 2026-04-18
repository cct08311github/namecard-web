"use client";

import React, { useTransition, useState, useCallback } from "react";
import Link from "next/link";

import type { CardCreateInput } from "@/db/schema";
import type { CardSummary } from "@/db/cards";
import type { CanonicalCardField } from "@/lib/csv/linkedin";
import { parseVcardFile } from "@/lib/vcard/parse";
import { parseCsvText } from "@/lib/csv/parse";
import { detectLinkedInFormat } from "@/lib/csv/linkedin";
import { vcardToCardCreateInput, csvRowToCardCreateInput } from "@/lib/import/mapper";
import { detectDuplicates, type DedupeResult } from "@/lib/import/dedupe";
import { FieldMappingDialog } from "@/components/import/FieldMappingDialog";

import { batchImportCardsAction } from "./actions";
import type { ImportDecision } from "@/db/cards-batch";
import type { BatchImportResult } from "@/db/cards-batch";
import styles from "./ImportWizard.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Source = "vcard" | "csv-linkedin" | "csv-generic";
type Phase = "idle" | "previewing" | "mapping" | "submitting" | "done" | "error";

interface PreviewRow extends DedupeResult {
  decision: ImportDecision;
}

interface ImportWizardProps {
  existingCards: CardSummary[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REASON_LABEL: Record<string, string> = {
  none: "新增",
  "email-match": "重複 (email)",
  "name-company-match": "重複 (名+公司)",
};

function displayName(row: CardCreateInput): string {
  return row.nameZh ?? row.nameEn ?? "(無姓名)";
}

function displayCompany(row: CardCreateInput): string {
  return row.companyZh ?? row.companyEn ?? "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportWizard({ existingCards }: ImportWizardProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeTab, setActiveTab] = useState<"vcard" | "csv">("vcard");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [source, setSource] = useState<Source>("vcard");
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // CSV mapping dialog state
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[][]>([]);
  const [initialMapping, setInitialMapping] = useState<Record<string, CanonicalCardField>>({});

  const [isPending, startTransition] = useTransition();

  // ------------------------------------------------------------------
  // File reading helpers
  // ------------------------------------------------------------------

  const readFileText = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error("讀取檔案失敗"));
      reader.readAsText(file, "utf-8");
    });
  }, []);

  // ------------------------------------------------------------------
  // vCard upload
  // ------------------------------------------------------------------

  const handleVcardFile = useCallback(
    async (file: File) => {
      try {
        const text = await readFileText(file);
        const parsed = parseVcardFile(text);

        const errors: string[] = [];
        const mapped: CardCreateInput[] = [];
        for (let i = 0; i < parsed.length; i++) {
          try {
            mapped.push(vcardToCardCreateInput(parsed[i]!));
          } catch (err) {
            errors.push(
              `第 ${i + 1} 筆 vCard：${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        setParseErrors(errors);
        setSource("vcard");

        const deduped = detectDuplicates(mapped, existingCards);
        const previewRows: PreviewRow[] = deduped.map((r) => ({
          ...r,
          decision: r.reason !== "none" ? { kind: "skip" } : { kind: "create" },
        }));
        setRows(previewRows);
        setPhase("previewing");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [existingCards, readFileText],
  );

  // ------------------------------------------------------------------
  // CSV upload
  // ------------------------------------------------------------------

  const handleCsvFile = useCallback(
    async (file: File) => {
      try {
        const text = await readFileText(file);
        const { headers, rows: rawRows } = parseCsvText(text);
        const detected = detectLinkedInFormat(headers);

        setCsvHeaders(headers);
        setCsvRawRows(rawRows);
        setInitialMapping(
          detected.confidence >= 0.7
            ? detected.columns
            : Object.fromEntries(headers.map((h) => [h, "ignored" as CanonicalCardField])),
        );
        setSource(detected.confidence >= 0.7 ? "csv-linkedin" : "csv-generic");
        setPhase("mapping");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [existingCards, readFileText],
  );

  // ------------------------------------------------------------------
  // After field-mapping dialog confirmed
  // ------------------------------------------------------------------

  const handleMappingConfirm = useCallback(
    (mapping: Record<string, CanonicalCardField>) => {
      const errors: string[] = [];
      const mapped: CardCreateInput[] = [];

      for (let i = 0; i < csvRawRows.length; i++) {
        const row = csvRawRows[i]!;
        try {
          mapped.push(csvRowToCardCreateInput(row, mapping, csvHeaders));
        } catch (err) {
          errors.push(`第 ${i + 1} 列：${err instanceof Error ? err.message : String(err)}`);
        }
      }

      setParseErrors(errors);
      const deduped = detectDuplicates(mapped, existingCards);
      const previewRows: PreviewRow[] = deduped.map((r) => ({
        ...r,
        decision: r.reason !== "none" ? { kind: "skip" } : { kind: "create" },
      }));
      setRows(previewRows);
      setPhase("previewing");
    },
    [csvHeaders, csvRawRows, existingCards],
  );

  // ------------------------------------------------------------------
  // Decision changes
  // ------------------------------------------------------------------

  const updateDecision = useCallback((idx: number, kind: string, matchId?: string) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        if (kind === "merge" && matchId) {
          return { ...r, decision: { kind: "merge", cardId: matchId } };
        }
        return { ...r, decision: { kind: kind as "create" | "skip" } };
      }),
    );
  }, []);

  const bulkDecision = useCallback((mode: "all-create" | "all-skip" | "skip-dupes") => {
    setRows((prev) =>
      prev.map((r) => {
        if (mode === "all-create") return { ...r, decision: { kind: "create" } };
        if (mode === "all-skip") return { ...r, decision: { kind: "skip" } };
        // skip-dupes: only set skip on rows that have a match
        if (mode === "skip-dupes" && r.reason !== "none") {
          return { ...r, decision: { kind: "skip" } };
        }
        return r;
      }),
    );
  }, []);

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  const handleSubmit = useCallback(() => {
    const rowInputs = rows.map((r) => r.row);
    const decisions = rows.map((r) => r.decision);

    setPhase("submitting");
    startTransition(async () => {
      const response = await batchImportCardsAction({
        rows: rowInputs,
        decisions,
        source,
      });

      if (response?.data) {
        setResult(response.data);
        setPhase("done");
      } else {
        setErrorMsg(response?.serverError ?? "匯入失敗，請重試");
        setPhase("error");
      }
    });
  }, [rows, source]);

  // ------------------------------------------------------------------
  // Reset
  // ------------------------------------------------------------------

  const handleReset = useCallback(() => {
    setPhase("idle");
    setRows([]);
    setParseErrors([]);
    setResult(null);
    setErrorMsg("");
    setCsvHeaders([]);
    setCsvRawRows([]);
  }, []);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const nonSkipCount = rows.filter((r) => r.decision.kind !== "skip").length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>匯入名片</h1>
        <p className={styles.lede}>從 vCard 或 CSV 批次建立聯絡人</p>
      </header>

      {/* ---- Step 1: Upload ---- */}
      {phase === "idle" && (
        <section className={styles.section} aria-labelledby="upload-heading">
          <h2 id="upload-heading" className={styles.sectionTitle}>
            選擇格式
          </h2>

          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "vcard"}
              className={`${styles.tab} ${activeTab === "vcard" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("vcard")}
            >
              vCard (.vcf)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "csv"}
              className={`${styles.tab} ${activeTab === "csv" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("csv")}
            >
              CSV
            </button>
          </div>

          {activeTab === "csv" && (
            <p className={styles.legalNotice}>此功能僅處理你自行 export 的 CSV，不做爬蟲。</p>
          )}

          {activeTab === "vcard" && (
            <div className={styles.dropzone}>
              <p className={styles.dropzoneHint}>選擇 .vcf 檔案</p>
              <input
                type="file"
                accept=".vcf,text/vcard"
                className={styles.fileInput}
                aria-label="選擇 vCard 檔案"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleVcardFile(file);
                }}
              />
            </div>
          )}

          {activeTab === "csv" && (
            <div className={styles.dropzone}>
              <p className={styles.dropzoneHint}>選擇 .csv 檔案</p>
              <input
                type="file"
                accept=".csv,text/csv"
                className={styles.fileInput}
                aria-label="選擇 CSV 檔案"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleCsvFile(file);
                }}
              />
            </div>
          )}
        </section>
      )}

      {/* ---- Field Mapping Dialog ---- */}
      {phase === "mapping" && (
        <FieldMappingDialog
          headers={csvHeaders}
          initialMapping={initialMapping}
          onConfirm={handleMappingConfirm}
          onCancel={handleReset}
        />
      )}

      {/* ---- Step 2 & 3: Preview table ---- */}
      {phase === "previewing" && (
        <section className={styles.section} aria-labelledby="preview-heading">
          <h2 id="preview-heading" className={styles.sectionTitle}>
            預覽 — {rows.length} 筆
          </h2>

          {source === "vcard" && (
            <p className={styles.infoBanner}>vCard 內嵌照片不會匯入；請用拍照鍵補上。</p>
          )}

          {parseErrors.length > 0 && (
            <div className={styles.errorBanner} role="alert">
              <p className={styles.errorBannerTitle}>部分資料無法解析：</p>
              <ul>
                {parseErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.bulkBar}>
            <button
              type="button"
              className={styles.bulkBtn}
              onClick={() => bulkDecision("all-create")}
            >
              全部建立
            </button>
            <button
              type="button"
              className={styles.bulkBtn}
              onClick={() => bulkDecision("all-skip")}
            >
              全部跳過
            </button>
            <button
              type="button"
              className={styles.bulkBtn}
              onClick={() => bulkDecision("skip-dupes")}
            >
              重複全部跳過
            </button>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>姓名</th>
                  <th className={styles.th}>公司</th>
                  <th className={styles.th}>狀態</th>
                  <th className={styles.th}>動作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className={styles.tr}>
                    <td className={styles.td}>{displayName(r.row)}</td>
                    <td className={styles.td}>{displayCompany(r.row)}</td>
                    <td className={styles.td}>
                      <span
                        className={`${styles.chip} ${r.reason !== "none" ? styles.chipDupe : styles.chipNew}`}
                      >
                        {REASON_LABEL[r.reason] ?? r.reason}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <select
                        className={styles.decisionSelect}
                        value={
                          r.decision.kind === "merge"
                            ? `merge:${(r.decision as { kind: "merge"; cardId: string }).cardId}`
                            : r.decision.kind
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.startsWith("merge:")) {
                            updateDecision(idx, "merge", val.slice(6));
                          } else {
                            updateDecision(idx, val);
                          }
                        }}
                        aria-label={`動作：${displayName(r.row)}`}
                      >
                        <option value="create">建立</option>
                        <option value="skip">跳過</option>
                        {r.match && <option value={`merge:${r.match.id}`}>合併</option>}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.submitBar}>
            <button type="button" className={styles.btnSecondary} onClick={handleReset}>
              取消
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleSubmit}
              disabled={isPending || nonSkipCount === 0}
            >
              匯入 {nonSkipCount} 張
            </button>
          </div>
        </section>
      )}

      {/* ---- Step 4: Submitting ---- */}
      {phase === "submitting" && (
        <div className={styles.stateScreen}>
          <p className={styles.stateMsg}>匯入中，請稍候…</p>
        </div>
      )}

      {/* ---- Step 5: Result ---- */}
      {phase === "done" && result && (
        <section className={styles.section} aria-labelledby="result-heading">
          <h2 id="result-heading" className={styles.sectionTitle}>
            匯入完成
          </h2>
          <dl className={styles.resultGrid}>
            <dt>新增</dt>
            <dd>{result.created} 張</dd>
            <dt>合併</dt>
            <dd>{result.merged} 張</dd>
            <dt>跳過</dt>
            <dd>{result.skipped} 張</dd>
          </dl>

          {result.errors.length > 0 && (
            <div className={styles.errorBanner} role="alert">
              <p className={styles.errorBannerTitle}>部分筆數發生錯誤：</p>
              <ul>
                {result.errors.map((e, i) => (
                  <li key={i}>
                    第 {e.rowIndex + 1} 筆：{e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.resultActions}>
            <Link href="/cards" className={styles.btnPrimary}>
              前往名片冊
            </Link>
            <button type="button" className={styles.btnSecondary} onClick={handleReset}>
              再匯入一批
            </button>
          </div>
        </section>
      )}

      {/* ---- Error screen ---- */}
      {phase === "error" && (
        <div className={styles.stateScreen}>
          <p className={styles.errorMsg} role="alert">
            {errorMsg || "發生未知錯誤"}
          </p>
          <button type="button" className={styles.btnSecondary} onClick={handleReset}>
            重試
          </button>
        </div>
      )}
    </div>
  );
}
