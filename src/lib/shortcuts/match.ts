/**
 * Pure keyboard-shortcut matcher. Used by the client-side
 * GlobalShortcuts component, but kept headless so the decision logic
 * is unit-testable without DOM/React.
 */

export type ShortcutAction =
  | { kind: "go"; href: string }
  | { kind: "show-help" }
  | { kind: "close-help" }
  | { kind: "open-palette" }
  | { kind: "close-palette" };

export interface KeyEventLike {
  key: string;
  // Any modifier held — we ignore shortcuts when modifiers are on so
  // browser/OS shortcuts (⌘K, Cmd+L, etc) keep working.
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  /**
   * Where the event originated. We never trigger shortcuts from inside
   * text inputs — the character would be swallowed.
   */
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}

export interface ShortcutContext {
  /** The key pressed immediately before this one, if within the prefix window. */
  prefix: "g" | null;
  /** True while the help overlay is open. Only Esc works then. */
  helpOpen: boolean;
  /** True while the search palette is open. Only Esc closes it (text typing handled internally). */
  paletteOpen?: boolean;
}

export interface MatchResult {
  action: ShortcutAction | null;
  /** What to do with the key buffer after this event. */
  nextPrefix: "g" | null;
}

/**
 * Returns the action triggered by this event (if any) AND what the
 * next prefix-buffer state should be. Pure function — callers hold
 * the actual state and timers.
 */
export function matchKeyEvent(ctx: ShortcutContext, e: KeyEventLike): MatchResult {
  // Cmd+K / Ctrl+K opens the palette from anywhere — including text
  // inputs (so users can ⌘K out of the new-card form to find someone)
  // — and once open, Esc closes it. Text input check happens *after*
  // this so the palette key beats input-blanking.
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    return { action: { kind: "open-palette" }, nextPrefix: null };
  }
  if (ctx.paletteOpen) {
    if (e.key === "Escape") return { action: { kind: "close-palette" }, nextPrefix: null };
    // Don't process other shortcuts while palette is open — its own
    // input handler owns arrows / Enter / typing.
    return { action: null, nextPrefix: null };
  }

  // Never intercept text input for non-modifier shortcuts.
  if (isTextInput(e.target)) return { action: null, nextPrefix: null };

  // When the help overlay is open, only Esc does something.
  if (ctx.helpOpen) {
    if (e.key === "Escape") return { action: { kind: "close-help" }, nextPrefix: null };
    return { action: null, nextPrefix: ctx.prefix };
  }

  // "/" opens the palette without modifiers — same as GitHub / Linear.
  if (e.key === "/") {
    return { action: { kind: "open-palette" }, nextPrefix: null };
  }

  // Ignore other modified keystrokes (let ⌘L etc. through).
  if (e.metaKey || e.ctrlKey || e.altKey) {
    return { action: null, nextPrefix: null };
  }

  // Active g-prefix: consume a single following nav key.
  if (ctx.prefix === "g") {
    switch (e.key) {
      case "h":
        return { action: { kind: "go", href: "/" }, nextPrefix: null };
      case "c":
        return { action: { kind: "go", href: "/cards" }, nextPrefix: null };
      case "t":
        return { action: { kind: "go", href: "/tags" }, nextPrefix: null };
      case "Escape":
        return { action: null, nextPrefix: null };
      default:
        // Any other key cancels the g-prefix without firing.
        return { action: null, nextPrefix: null };
    }
  }

  // No prefix — leaf shortcuts.
  switch (e.key) {
    case "g":
      return { action: null, nextPrefix: "g" };
    case "c":
      return { action: { kind: "go", href: "/cards/new" }, nextPrefix: null };
    case "?":
      return { action: { kind: "show-help" }, nextPrefix: null };
    case "Escape":
      return { action: null, nextPrefix: null };
    default:
      return { action: null, nextPrefix: null };
  }
}

function isTextInput(target: KeyEventLike["target"]): boolean {
  if (!target) return false;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}
