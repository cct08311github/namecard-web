"use client";

import { useRouter } from "next/navigation";

import { createTagAction } from "@/app/(app)/tags/actions";
import type { CardCreateInput } from "@/db/schema";

import { TagSuggestionsPanel } from "./TagSuggestionsPanel";

interface TagSuggestionsBannerProps {
  cardId: string;
  cardDraft: CardCreateInput;
  currentTagIds: string[];
  currentTagNames: string[];
}

/**
 * Thin wrapper that wires TagSuggestionsPanel into the card detail page.
 * Calls createTagAction when the user applies a suggestion, then refreshes
 * the page so the tag list reflects the new state.
 */
export function TagSuggestionsBanner({
  cardId,
  cardDraft,
  currentTagIds,
  currentTagNames,
}: TagSuggestionsBannerProps) {
  const router = useRouter();

  const handleApply = async (tagName: string) => {
    const res = await createTagAction({ name: tagName });
    if (res?.serverError || !res?.data) return;
    // Navigate to the card page without ?suggest=1, triggering a fresh RSC
    // render with the updated tag visible in the detail view.
    router.replace(`/cards/${cardId}`);
    router.refresh();
  };

  return (
    <TagSuggestionsPanel
      cardDraft={cardDraft}
      selectedTagIds={currentTagIds}
      selectedTagNames={currentTagNames}
      onApply={handleApply}
    />
  );
}
