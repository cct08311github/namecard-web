"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Selection state for the /cards multi-select toolbar.
 *
 * Backed by a Set so duplicate-toggle is O(1). Read paths return
 * stable arrays / counts via memoization to keep React happy.
 */
export interface CardSelectionApi {
  selected: ReadonlySet<string>;
  selectedIds: string[];
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
}

export function useCardSelection(): CardSelectionApi {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  return useMemo(
    () => ({
      selected,
      selectedIds,
      count: selected.size,
      isSelected,
      toggle,
      setMany,
      clear,
    }),
    [selected, selectedIds, isSelected, toggle, setMany, clear],
  );
}
