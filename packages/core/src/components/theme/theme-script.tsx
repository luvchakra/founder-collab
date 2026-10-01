/**
 * Runs synchronously in <head>, before first paint, so the correct theme class is on
 * <html> before React hydrates -- avoids a flash of the wrong theme. Reads the same
 * localStorage key ThemeProvider (./theme-provider.tsx) reads and writes.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem("theme") || "system";
    var isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {}
})();
`;

/** `nonce` is the per-request CSP nonce (security/headers.ts) -- an inline script
 * without it is blocked by the strict-dynamic script-src. */
export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
