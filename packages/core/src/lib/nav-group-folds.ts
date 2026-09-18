/**
 * Which nav sections inside an expanded module are open, for the rail's own storage
 * (app-sidebar.tsx). Same `localStorage`-key convention as `PINNED_BUSINESSES_STORAGE_KEY`
 * and `SELECTED_MODULE_STORAGE_KEY` -- there is no per-user preferences table in `core`,
 * so client-only storage is the established pattern here.
 *
 * Sections start **folded**. Inventory alone has five of them and ~15 links, so opening a
 * module used to mean scrolling past every section to reach the one you work in; now it
 * opens as a short list of headings. The one exception is the section holding the page
 * you're on, which starts open -- folding that one would hide where you actually are.
 *
 * Only sections the founder has clicked are stored, as `"<moduleKey>::<heading>" ->
 * expanded?`. A map rather than a list of keys because a list cannot tell "never touched"
 * (take the default) apart from "deliberately folded", and with folded as the default
 * that distinction is the whole behaviour. Keys are scoped per module so Inventory's
 * "Overview" and FSM's "Overview" fold independently.
 *
 * The storage key is deliberately new. Its two predecessors each held a plain list --
 * `cofounderai:collapsed-nav-groups`, then `cofounderai:expanded-nav-groups` -- and a
 * list cannot express "never touched", so reading either here as a map would be wrong
 * (the first one inverted). `parseNavGroupFolds` also refuses a list-shaped value.
 */
export const NAV_GROUP_FOLDS_STORAGE_KEY = "cofounderai:nav-group-folds";

export type NavGroupFolds = Record<string, boolean>;

export function navGroupKey(moduleKey: string, heading: string): string {
  return `${moduleKey}::${heading}`;
}

/** `holdsActive` is the default for a section the founder has never touched. */
export function isNavGroupExpanded(
  folds: NavGroupFolds,
  key: string,
  holdsActive: boolean,
): boolean {
  return folds[key] ?? holdsActive;
}

/** Flips a section relative to whatever it is *showing* right now, so the chevron always
 * does what it looks like it will -- including the first click on a section that is open
 * only because it holds the current page. */
export function toggleNavGroup(
  folds: NavGroupFolds,
  key: string,
  holdsActive: boolean,
): NavGroupFolds {
  return { ...folds, [key]: !isNavGroupExpanded(folds, key, holdsActive) };
}

export function readNavGroupFolds(): NavGroupFolds {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NAV_GROUP_FOLDS_STORAGE_KEY);
    if (!raw) return {};
    return parseNavGroupFolds(JSON.parse(raw));
  } catch {
    // Unavailable or corrupt (hand-edited, truncated write) -- every section falls back
    // to its default, which is the same state a first-time visitor gets.
    return {};
  }
}

/** Split out from the read so the "what survives a corrupt value" rule is testable
 * without a browser. */
export function parseNavGroupFolds(parsed: unknown): NavGroupFolds {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

export function writeNavGroupFolds(folds: NavGroupFolds) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NAV_GROUP_FOLDS_STORAGE_KEY, JSON.stringify(folds));
  } catch {
    // Storage unavailable (private browsing, quota) -- folds just won't persist.
  }
}
