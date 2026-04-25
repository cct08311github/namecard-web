import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useCardSelection } from "../useCardSelection";

describe("useCardSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useCardSelection());
    expect(result.current.count).toBe(0);
    expect(result.current.selectedIds).toEqual([]);
  });

  it("toggle adds and removes", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.count).toBe(1);
    act(() => result.current.toggle("a"));
    expect(result.current.isSelected("a")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("setMany on=true adds all (deduped)", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.setMany(["a", "b", "a"], true));
    expect(result.current.count).toBe(2);
    expect(result.current.selectedIds.sort()).toEqual(["a", "b"]);
  });

  it("setMany on=false removes only the listed ids", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.setMany(["a", "b", "c"], true));
    act(() => result.current.setMany(["b"], false));
    expect(result.current.selectedIds.sort()).toEqual(["a", "c"]);
  });

  it("clear empties everything", () => {
    const { result } = renderHook(() => useCardSelection());
    act(() => result.current.setMany(["a", "b"], true));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("api object identity changes only when state does", () => {
    const { result, rerender } = renderHook(() => useCardSelection());
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
    act(() => result.current.toggle("x"));
    expect(result.current).not.toBe(before);
  });
});
