import { describe, expect, it } from "vitest";

import { matchKeyEvent, type KeyEventLike, type ShortcutContext } from "../match";

const noPrefix: ShortcutContext = { prefix: null, helpOpen: false };
const gPrefix: ShortcutContext = { prefix: "g", helpOpen: false };
const helpOpen: ShortcutContext = { prefix: null, helpOpen: true };

function key(k: string, overrides: Partial<KeyEventLike> = {}): KeyEventLike {
  return { key: k, ...overrides };
}

describe("matchKeyEvent — leaf keys", () => {
  it("c navigates to /cards/new", () => {
    const r = matchKeyEvent(noPrefix, key("c"));
    expect(r.action).toEqual({ kind: "go", href: "/cards/new" });
    expect(r.nextPrefix).toBeNull();
  });

  it("? shows help overlay", () => {
    const r = matchKeyEvent(noPrefix, key("?"));
    expect(r.action).toEqual({ kind: "show-help" });
  });

  it("g enters prefix without firing", () => {
    const r = matchKeyEvent(noPrefix, key("g"));
    expect(r.action).toBeNull();
    expect(r.nextPrefix).toBe("g");
  });

  it("unknown key does nothing", () => {
    expect(matchKeyEvent(noPrefix, key("z"))).toEqual({ action: null, nextPrefix: null });
  });
});

describe("matchKeyEvent — g prefix", () => {
  it("g then h → /", () => {
    expect(matchKeyEvent(gPrefix, key("h")).action).toEqual({ kind: "go", href: "/" });
  });

  it("g then c → /cards", () => {
    expect(matchKeyEvent(gPrefix, key("c")).action).toEqual({ kind: "go", href: "/cards" });
  });

  it("g then t → /tags", () => {
    expect(matchKeyEvent(gPrefix, key("t")).action).toEqual({ kind: "go", href: "/tags" });
  });

  it("g then random key cancels without firing", () => {
    const r = matchKeyEvent(gPrefix, key("x"));
    expect(r.action).toBeNull();
    expect(r.nextPrefix).toBeNull();
  });

  it("g then Escape cancels", () => {
    const r = matchKeyEvent(gPrefix, key("Escape"));
    expect(r.action).toBeNull();
    expect(r.nextPrefix).toBeNull();
  });
});

describe("matchKeyEvent — guards", () => {
  it("ignores when focus is in an input", () => {
    const r = matchKeyEvent(noPrefix, key("c", { target: { tagName: "INPUT" } }));
    expect(r.action).toBeNull();
  });

  it("ignores when focus is in a textarea", () => {
    const r = matchKeyEvent(noPrefix, key("c", { target: { tagName: "TEXTAREA" } }));
    expect(r.action).toBeNull();
  });

  it("ignores when focus is contentEditable", () => {
    const r = matchKeyEvent(
      noPrefix,
      key("c", { target: { tagName: "DIV", isContentEditable: true } }),
    );
    expect(r.action).toBeNull();
  });

  it("ignores modified keystrokes so ⌘K still works", () => {
    expect(matchKeyEvent(noPrefix, key("k", { metaKey: true })).action).toBeNull();
    expect(matchKeyEvent(noPrefix, key("c", { ctrlKey: true })).action).toBeNull();
    expect(matchKeyEvent(noPrefix, key("?", { altKey: true })).action).toBeNull();
  });
});

describe("matchKeyEvent — help overlay", () => {
  it("only Escape closes; other keys no-op but prefix is preserved", () => {
    expect(matchKeyEvent(helpOpen, key("Escape")).action).toEqual({ kind: "close-help" });
    const ignored = matchKeyEvent(helpOpen, key("c"));
    expect(ignored.action).toBeNull();
    expect(ignored.nextPrefix).toBe(helpOpen.prefix);
  });
});
