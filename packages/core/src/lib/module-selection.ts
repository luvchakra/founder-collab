/**
 * The single source of truth for "which module is currently selected" in the shell's
 * bottom module-picker (AppSidebar) -- read directly by the AI chat widget too
 * (module-discovery/components/chat/ai-chat-widget.tsx) so it can ground its answers in
 * whatever module the founder is actually looking at, without needing a shared React
 * context wired across two different packages' component trees. Exporting the storage
 * key (and this one read helper) from `core` rather than each side re-typing the same
 * string literal is what keeps the two in sync.
 */
export const SELECTED_MODULE_STORAGE_KEY = "cofounderai:selected-module";

export function readSelectedModuleKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SELECTED_MODULE_STORAGE_KEY);
  } catch {
    return null;
  }
}
