import {
  APP_INSTALLED_EVENT,
  INSTALL_BANNER_STORAGE_KEY,
  INSTALL_PROMPT_READY_EVENT,
} from "@/lib/install-banner/eligibility";

/**
 * BRAND-13 -- runs in <head>, before React, because Chromium may fire
 * `beforeinstallprompt` before the banner has mounted, and an event nobody was listening
 * for is gone. It keeps the event on `window` (with Chrome's own mini-infobar suppressed)
 * for the banner to pick up, and remembers an `appinstalled` on this browser. The CSP
 * allows inline scripts (lib/security-headers.ts), the same as ThemeScript.
 */
const CAPTURE_SCRIPT = `
(function () {
  try {
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      window.__wonderarkInstallPrompt = event;
      window.dispatchEvent(new Event(${JSON.stringify(INSTALL_PROMPT_READY_EVENT)}));
    });
    window.addEventListener("appinstalled", function () {
      window.__wonderarkInstallPrompt = null;
      try {
        localStorage.setItem(${JSON.stringify(INSTALL_BANNER_STORAGE_KEY)}, JSON.stringify({ installed: true }));
      } catch (e) {}
      window.dispatchEvent(new Event(${JSON.stringify(APP_INSTALLED_EVENT)}));
    });
  } catch (e) {}
})();
`;

export function InstallPromptCaptureScript() {
  return <script dangerouslySetInnerHTML={{ __html: CAPTURE_SCRIPT }} />;
}
