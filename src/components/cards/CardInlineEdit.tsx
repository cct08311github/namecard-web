"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateCardAction } from "@/app/(app)/cards/actions";
import type { CardUpdateInput } from "@/db/schema";

import { InlineEditField } from "./InlineEditField";

type EditableField =
  | "nameZh"
  | "nameEn"
  | "jobTitleZh"
  | "jobTitleEn"
  | "companyZh"
  | "companyEn"
  | "department"
  | "whyRemember";

interface CardInlineEditProps {
  cardId: string;
  field: EditableField;
  value: string | undefined;
  placeholder: string;
  ariaLabel: string;
  multiline?: boolean;
  maxLength?: number;
  className?: string;
}

/**
 * Thin Server-Action wrapper around <InlineEditField>. Lives next to
 * its sibling because the detail page is an RSC and can't host
 * useState directly. Only one field changes per save — `updateCardAction`
 * already accepts partial cardUpdateSchema input.
 */
export function CardInlineEdit({
  cardId,
  field,
  value,
  placeholder,
  ariaLabel,
  multiline,
  maxLength,
  className,
}: CardInlineEditProps) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<string | undefined>(undefined);

  const displayed = optimistic ?? value;

  const handleSave = async (next: string) => {
    // For whyRemember (required, min 1 char), reject empty values up
    // front. For other optional fields, empty means "clear".
    if (field === "whyRemember" && !next) {
      throw new Error("「為什麼記得」不能為空");
    }
    setOptimistic(next);
    const patch: CardUpdateInput = { [field]: next || undefined };
    const result = await updateCardAction({ id: cardId, input: patch });
    if (result?.serverError) {
      setOptimistic(undefined);
      throw new Error(result.serverError);
    }
    if (result?.validationErrors) {
      setOptimistic(undefined);
      throw new Error("輸入格式有問題");
    }
    // Refresh so the server-rendered shell picks up the new value;
    // optimistic stays until the refetch completes so there's no flash.
    router.refresh();
  };

  return (
    <InlineEditField
      value={displayed}
      onSave={handleSave}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      multiline={multiline}
      maxLength={maxLength}
      className={className}
    />
  );
}
