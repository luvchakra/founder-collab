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

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
