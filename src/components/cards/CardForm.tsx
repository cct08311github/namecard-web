"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import type { z } from "zod";

import { createCardAction, updateCardAction } from "@/app/(app)/cards/actions";
import { TagInput } from "@/components/tags/TagInput";
import { cardCreateSchema, type CardCreateInput } from "@/db/schema";

import styles from "./CardForm.module.css";

/** RHF form values use the Zod INPUT type (fields with .default() can be undefined). */
type CardFormValues = z.input<typeof cardCreateSchema>;

export interface CardFormSuggestions {
  /** Existing zh + en company names from the workspace, deduped. */
  companies?: string[];
  /** Existing zh + en job titles. */
  jobTitles?: string[];
  /** Existing departments. */
  departments?: string[];
  /** Existing firstMetEventTag values. */
  events?: string[];
}

interface CardFormProps {
  mode: "create" | "edit";
  cardId?: string;
  defaults?: Partial<CardFormValues>;
  /** Optional prior values shown as <datalist> hints to encourage consistency. */
  suggestions?: CardFormSuggestions;
}

const EMPTY_DEFAULTS: CardFormValues = {
  nameZh: "",
  nameEn: "",
  namePhonetic: "",
  jobTitleZh: "",
  jobTitleEn: "",
  department: "",
  companyZh: "",
  companyEn: "",
  companyWebsite: undefined,
  phones: [],
  emails: [],
  addresses: [],
  social: {},
  whyRemember: "",
  firstMetDate: undefined,
  firstMetContext: "",
  firstMetEventTag: "",
  notes: "",
  tagIds: [],
  tagNames: [],
  frontImagePath: undefined,
  backImagePath: undefined,
  ocrProvider: undefined,
  ocrConfidence: undefined,
  ocrRawJson: undefined,
};

function mergeDefaults(partial?: Partial<CardFormValues>): CardFormValues {
  return {
    ...EMPTY_DEFAULTS,
    ...partial,
    phones: partial?.phones ?? [],
    emails: partial?.emails ?? [],
    addresses: partial?.addresses ?? [],
    social: partial?.social ?? {},
    tagIds: partial?.tagIds ?? [],
    tagNames: partial?.tagNames ?? [],
  };
}

export function CardForm({ mode, cardId, defaults, suggestions }: CardFormProps) {
  const router = useRouter();
  const [submitting, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CardFormValues>({
    resolver: zodResolver(cardCreateSchema) as unknown as Resolver<CardFormValues>,
    defaultValues: mergeDefaults(defaults),
    mode: "onBlur",
  });

  const phones = useFieldArray({ control: form.control, name: "phones" });
  const emails = useFieldArray({ control: form.control, name: "emails" });

  const onSubmit: SubmitHandler<CardFormValues> = (data) => {
    setServerError(null);
    startTransition(async () => {
      const payload: CardCreateInput = {
        ...(data as CardCreateInput),
        companyWebsite: data.companyWebsite || undefined,
        firstMetDate: data.firstMetDate || undefined,
      };
      const result =
        mode === "create"
          ? await createCardAction(payload)
          : await updateCardAction({ id: cardId!, input: payload });
      if (result?.serverError) {
        setServerError(result.serverError);
        return;
      }
      if (result?.validationErrors) {
        setServerError("輸入格式有誤，請檢查欄位。");
        return;
      }
      if (mode === "create") {
        const id = result?.data && "id" in result.data ? result.data.id : null;
        // Append ?suggest=1 so the detail page shows the tag suggestion panel.
        if (id) router.push(`/cards/${id}?suggest=1`);
        else router.push("/cards");
      } else {
        router.push(`/cards/${cardId}`);
      }
      router.refresh();
    });
  };

  const { register, formState, watch, setValue } = form;
  const tagIds = watch("tagIds") ?? [];
  const tagNames = watch("tagNames") ?? [];

  return (
    <form className={styles.form} onSubmit={form.handleSubmit(onSubmit)}>
      <fieldset className={styles.section}>
        <legend className={styles.legend}>身分</legend>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>中文姓名</span>
            <input
              className={styles.input}
              {...register("nameZh")}
              autoComplete="off"
              placeholder="例：陳志明"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>英文姓名</span>
            <input
              className={styles.input}
              {...register("nameEn")}
              autoComplete="off"
              placeholder="e.g. Alice Chen"
            />
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>職稱 (中)</span>
            <input className={styles.input} {...register("jobTitleZh")} list="cardform-jobtitles" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>職稱 (英)</span>
            <input className={styles.input} {...register("jobTitleEn")} list="cardform-jobtitles" />
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>公司 (中)</span>
            <input className={styles.input} {...register("companyZh")} list="cardform-companies" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>公司 (英)</span>
            <input className={styles.input} {...register("companyEn")} list="cardform-companies" />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>部門</span>
          <input className={styles.input} {...register("department")} list="cardform-departments" />
        </label>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>聯絡</legend>

        <div className={styles.multiList}>
          {phones.fields.map((field, index) => (
            <div key={field.id} className={styles.multiRow}>
              <select className={styles.select} {...register(`phones.${index}.label`)}>
                <option value="mobile">mobile</option>
                <option value="office">office</option>
                <option value="home">home</option>
                <option value="fax">fax</option>
                <option value="other">other</option>
              </select>
              <input
                className={styles.input}
                placeholder="+886-912-345-678"
                {...register(`phones.${index}.value`)}
              />
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => phones.remove(index)}
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
        </div>

        <div className={styles.multiList}>
          {emails.fields.map((field, index) => (
            <div key={field.id} className={styles.multiRow}>
              <select className={styles.select} {...register(`emails.${index}.label`)}>
                <option value="work">work</option>
                <option value="personal">personal</option>
                <option value="other">other</option>
              </select>
              <input
                type="email"
                className={styles.input}
                placeholder="name@example.com"
                {...register(`emails.${index}.value`)}
              />
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => emails.remove(index)}
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
        </div>

        <label className={styles.field}>
          <span className={styles.label}>公司網站</span>
          <input
            className={styles.input}
            type="url"
            placeholder="https://"
            {...register("companyWebsite")}
          />
        </label>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>社群</legend>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>LINE ID</span>
            <input className={styles.input} {...register("social.lineId")} />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>微信</span>
            <input className={styles.input} {...register("social.wechatId")} />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>LinkedIn URL</span>
          <input
            className={styles.input}
            type="url"
            placeholder="https://linkedin.com/in/..."
            {...register("social.linkedinUrl")}
          />
        </label>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>關係脈絡</legend>
        <label className={`${styles.field} ${styles.required}`}>
          <span className={styles.label}>
            為什麼記得這個人
            <em className={styles.requiredMark}>必填</em>
          </span>
          <textarea
            className={styles.textarea}
            rows={3}
            placeholder="例：2024 COMPUTEX 攤位聊到邊緣 AI 推論的推論效能。"
            {...register("whyRemember")}
          />
          {formState.errors.whyRemember && (
            <span className={styles.errorText}>{formState.errors.whyRemember.message}</span>
          )}
        </label>
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
              list="cardform-events"
              {...register("firstMetEventTag")}
            />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>場合敘述</span>
          <input
            className={styles.input}
            placeholder="Keynote 後走廊閒聊"
            {...register("firstMetContext")}
          />
        </label>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>標籤</legend>
        <div className={styles.field}>
          <span className={styles.label}>用標籤分類（例：COMPUTEX 2024、半導體、待回覆）</span>
          <TagInput
            value={tagIds}
            nameValue={tagNames}
            onChange={(ids, names) => {
              setValue("tagIds", ids, { shouldDirty: true });
              setValue("tagNames", names, { shouldDirty: true });
            }}
            disabled={submitting}
          />
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>備註</legend>
        <label className={styles.field}>
          <span className={styles.label}>自由備註（支援多行）</span>
          <textarea className={styles.textarea} rows={4} {...register("notes")} />
        </label>
      </fieldset>

      {serverError && (
        <p role="alert" className={styles.serverError}>
          {serverError}
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.back()}>
          取消
        </button>
        <button type="submit" className={styles.primaryBtn} disabled={submitting}>
          {submitting ? "儲存中…" : mode === "create" ? "儲存名片" : "更新名片"}
        </button>
      </div>

      {/* Native datalist autocompletion sourced from existing card values.
          One <datalist> per field type — companyZh + companyEn share the
          same list to encourage cross-language consistency. */}
      {suggestions?.companies && suggestions.companies.length > 0 && (
        <datalist id="cardform-companies">
          {suggestions.companies.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      )}
      {suggestions?.jobTitles && suggestions.jobTitles.length > 0 && (
        <datalist id="cardform-jobtitles">
          {suggestions.jobTitles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
      {suggestions?.departments && suggestions.departments.length > 0 && (
        <datalist id="cardform-departments">
          {suggestions.departments.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      )}
      {suggestions?.events && suggestions.events.length > 0 && (
        <datalist id="cardform-events">
          {suggestions.events.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
      )}
    </form>
  );
}
