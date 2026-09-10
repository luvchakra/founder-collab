/** Same `localStorage`-key convention as the sidebar's own pinned-module feature
 * (app-sidebar.tsx's `PINNED_MODULE_STORAGE_KEY`) -- there is no per-user preferences
 * table in `core` to extend, so client-only storage is the established pattern here, not
 * a gap specific to this feature. Unlike pinning a module (an exclusive lock -- only one
 * module can be pinned, and it disables switching away from it), pinning a business is a
 * plain favorites list: any number of businesses can be pinned, pinning never blocks
 * switching to an unpinned one, it just sorts pinned businesses to the top of the
 * business switcher's list. Shared between business-switcher.tsx (reads/writes pins) and
 * dashboard-chrome.tsx (reads the top pin to pick a landing business on a URL with none). */
export const PINNED_BUSINESSES_STORAGE_KEY = "cofounderai:pinned-businesses";

export function readPinnedBusinessIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PINNED_BUSINESSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writePinnedBusinessIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PINNED_BUSINESSES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private browsing, quota) -- pins just won't persist.
  }
}
