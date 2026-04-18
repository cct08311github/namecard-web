"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type FormEvent } from "react";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { VoiceCapture } from "@/components/capture/VoiceCapture";
import { cardCreateSchema, type CardCreateInput } from "@/db/schema";
import type { OcrFields } from "@/lib/ocr";
import { isLowConfidence } from "@/lib/ocr";

import styles from "./CardFormPrefilled.module.css";

type CardFormValues = z.input<typeof cardCreateSchema>;

interface CardFormPrefilledProps {
  ocrFields: OcrFields;
  imagePath: string;
  onSubmit: (payload: CardCreateInput) => void;
  submitting: boolean;
  serverError: string | null;
}

function toDefaults(ocrFields: OcrFields, imagePath: string): CardFormValues {
  return {
    nameZh: ocrFields.nameZh?.value ?? "",
    nameEn: ocrFields.nameEn?.value ?? "",
    namePhonetic: ocrFields.namePhonetic?.value ?? "",
    jobTitleZh: ocrFields.jobTitleZh?.value ?? "",
    jobTitleEn: ocrFields.jobTitleEn?.value ?? "",
    department: ocrFields.department?.value ?? "",
    companyZh: ocrFields.companyZh?.value ?? "",
    companyEn: ocrFields.companyEn?.value ?? "",
    companyWebsite: ocrFields.companyWebsite?.value ?? "",
    phones: (ocrFields.phones ?? []).map((p) => ({ label: p.label, value: p.value })),
    emails: (ocrFields.emails ?? []).map((e) => ({ label: e.label, value: e.value })),
    addresses: [],
    social: {
      lineId: ocrFields.social?.lineId?.value ?? "",
      wechatId: ocrFields.social?.wechatId?.value ?? "",
      linkedinUrl: ocrFields.social?.linkedinUrl?.value ?? "",
      websiteUrl: ocrFields.social?.websiteUrl?.value ?? "",
    },
    whyRemember: "",
    firstMetDate: "",
    firstMetContext: "",
    firstMetEventTag: "",
    notes: "",
    tagIds: [],
    tagNames: [],
    frontImagePath: imagePath,
    backImagePath: undefined,
    ocrProvider: undefined,
    ocrConfidence: undefined,
    ocrRawJson: undefined,
  };
}

function suggestTemplates(ocrFields: OcrFields): string[] {
  const company = ocrFields.companyZh?.value || ocrFields.companyEn?.value;
  const name = ocrFields.nameZh?.value || ocrFields.nameEn?.value;
  const role = ocrFields.jobTitleZh?.value || ocrFields.jobTitleEn?.value;
  const items: string[] = [];
  if (company) items.push(`在 ${company} 認識的，聊到 ___`);
  if (role && company) items.push(`${company} 的 ${role}，介紹了 ___`);
  if (name) items.push(`${name} 介紹我認識 ___`);
  items.push("在 ___ 活動遇到，印象最深的是 ___");
  return items;
}

export function CardFormPrefilled({
  ocrFields,
  imagePath,
  onSubmit,
  submitting,
  serverError,
}: CardFormPrefilledProps) {
  const defaults = toDefaults(ocrFields, imagePath);
  const form = useForm<CardFormValues>({
    resolver: zodResolver(cardCreateSchema) as unknown as Resolver<CardFormValues>,
    defaultValues: defaults,
    mode: "onBlur",
  });
  const phones = useFieldArray({ control: form.control, name: "phones" });
  const emails = useFieldArray({ control: form.control, name: "emails" });

  const { register, handleSubmit: rhfSubmit, setValue, getValues, formState } = form;
  const [templates] = useState(() => suggestTemplates(ocrFields));
  const [showTemplates, setShowTemplates] = useState(true);

  function applyTemplate(t: string) {
    const current = getValues("whyRemember") ?? "";
    setValue("whyRemember", current ? `${current}\n${t}` : t, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setShowTemplates(false);
  }

  function handleVoiceTranscript(text: string) {
    const current = getValues("whyRemember") ?? "";
    setValue("whyRemember", current ? `${current} ${text}` : text, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setShowTemplates(false);
  }

  function onFinalSubmit(data: CardFormValues) {
    const payload: CardCreateInput = {
      ...(data as CardCreateInput),
      companyWebsite: data.companyWebsite || undefined,
      firstMetDate: data.firstMetDate || undefined,
    };
    onSubmit(payload);
  }

  function handleFormSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    rhfSubmit(onFinalSubmit)(e);
  }

  // Flag low-confidence fields with a marker class.
  const lowConf = {
    nameZh: isLowConfidence(ocrFields.nameZh),
    nameEn: isLowConfidence(ocrFields.nameEn),
    jobTitleZh: isLowConfidence(ocrFields.jobTitleZh),
    jobTitleEn: isLowConfidence(ocrFields.jobTitleEn),
    companyZh: isLowConfidence(ocrFields.companyZh),
    companyEn: isLowConfidence(ocrFields.companyEn),
  };

  return (
    <form className={styles.form} onSubmit={handleFormSubmit}>
      <fieldset className={styles.section}>
        <legend className={styles.legend}>身分（請校對）</legend>
        <label className={`${styles.field} ${lowConf.nameZh ? styles.lowConf : ""}`}>
          <span className={styles.label}>中文姓名</span>
          <input className={styles.input} {...register("nameZh")} />
        </label>
        <label className={`${styles.field} ${lowConf.nameEn ? styles.lowConf : ""}`}>
          <span className={styles.label}>英文姓名</span>
          <input className={styles.input} {...register("nameEn")} />
        </label>
        <div className={styles.row}>
          <label className={`${styles.field} ${lowConf.jobTitleZh ? styles.lowConf : ""}`}>
            <span className={styles.label}>職稱（中）</span>
            <input className={styles.input} {...register("jobTitleZh")} />
          </label>
          <label className={`${styles.field} ${lowConf.companyZh ? styles.lowConf : ""}`}>
            <span className={styles.label}>公司（中）</span>
            <input className={styles.input} {...register("companyZh")} />
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>聯絡（請校對）</legend>
        {phones.fields.map((f, idx) => (
          <div key={f.id} className={styles.multiRow}>
            <select className={styles.select} {...register(`phones.${idx}.label`)}>
              <option value="mobile">mobile</option>
              <option value="office">office</option>
              <option value="home">home</option>
              <option value="fax">fax</option>
              <option value="other">other</option>
            </select>
            <input
              className={styles.input}
              placeholder="+886-912-345-678"
              {...register(`phones.${idx}.value`)}
            />
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => phones.remove(idx)}
              aria-label="移除電話"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => phones.append({ label: "mobile", value: "" })}
        >
          + 新增電話
        </button>
        {emails.fields.map((f, idx) => (
          <div key={f.id} className={styles.multiRow}>
            <select className={styles.select} {...register(`emails.${idx}.label`)}>
              <option value="work">work</option>
              <option value="personal">personal</option>
              <option value="other">other</option>
            </select>
            <input
              type="email"
              className={styles.input}
              placeholder="name@example.com"
              {...register(`emails.${idx}.value`)}
            />
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => emails.remove(idx)}
              aria-label="移除 Email"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => emails.append({ label: "work", value: "" })}
        >
          + 新增 Email
        </button>
      </fieldset>

      <fieldset className={`${styles.section} ${styles.whySection}`}>
        <legend className={styles.legend}>
          為什麼記得這個人
          <em className={styles.requiredMark}>必填 · 差異化核心</em>
        </legend>
        <p className={styles.whyHelp}>
          寫下當下場景、聊到什麼、為什麼值得記得。未來搜尋「模糊印象」時，這句就是鑰匙。
        </p>

        <VoiceCapture onTranscript={handleVoiceTranscript} />

        <textarea
          className={styles.textarea}
          rows={4}
          placeholder="例：2024 COMPUTEX 攤位聊到邊緣 AI 推論，跟我認識的 Y 有合作空間。"
          {...register("whyRemember")}
        />
        {formState.errors.whyRemember && (
          <span className={styles.errorText}>{formState.errors.whyRemember.message}</span>
        )}

        {showTemplates && templates.length > 0 && (
          <div className={styles.templates}>
            <p className={styles.templatesTitle}>需要靈感？點一下接手改：</p>
            <ul className={styles.templateList}>
              {templates.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    className={styles.templateBtn}
                    onClick={() => applyTemplate(t)}
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>首次見面日期</span>
            <input type="date" className={styles.input} {...register("firstMetDate")} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>場合 tag</span>
            <input
              className={styles.input}
              placeholder="COMPUTEX 2024"
              {...register("firstMetEventTag")}
            />
          </label>
        </div>
      </fieldset>

      {serverError && (
        <p role="alert" className={styles.serverError}>
          {serverError}
        </p>
      )}

      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={submitting}>
          {submitting ? "儲存中…" : "存檔（含 OCR 圖片）"}
        </button>
      </div>
    </form>
  );
}
