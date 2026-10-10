/**
 * BRAND-13 -- when the "install the app" banner shows, as pure functions of what the
 * browser reports. The component (`components/install-banner/install-banner.tsx`) only
 * reads those facts and renders the answer, so every rule here is unit-tested without a
 * browser (`eligibility.test.ts`).
 *
 * The banner shows only on a phone or tablet, only in a normal browser tab (never inside
 * the installed app), only when this browser can really install the app -- a captured
 * `beforeinstallprompt` (Chromium) or iOS/iPadOS's "Add to Home Screen" -- and only when
 * the person has not installed, dismissed or declined it recently.
 */

/** localStorage key, namespaced to the product. */
export const INSTALL_BANNER_STORAGE_KEY = "wonderark:install-banner";

/** A dismissal (the close button) or a declined install prompt hides the banner this long. */
export const INSTALL_BANNER_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** Window events the early capture script (`install-prompt-capture-script.tsx`) dispatches. */
export const INSTALL_PROMPT_READY_EVENT = "wonderark:install-prompt";
export const APP_INSTALLED_EVENT = "wonderark:app-installed";

/** What the banner remembers on this browser. */
export type StoredInstallState = { installed?: true; snoozedUntil?: number };

export type InstallBannerVariant = "hidden" | "one-tap" | "ios-instructions";

export type InstallBannerInputs = {
  /** The current route may carry the banner (`isInstallBannerRoute`). */
  routeAllowed: boolean;
  /** A phone or tablet (`isPhoneOrTablet`); desktops, touchscreen laptops included, are not. */
  phoneOrTablet: boolean;
  /** Already running as the installed app (`isRunningInstalled`). */
  runningInstalled: boolean;
  /** `navigator.getInstalledRelatedApps()` returned an entry for this app. */
  relatedAppInstalled: boolean;
  /** An in-app browser (Instagram, Facebook, LinkedIn...), which cannot install anything. */
  inAppBrowser: boolean;
  /** A `beforeinstallprompt` was captured and not used yet: Chromium can install in one tap. */
  hasInstallPrompt: boolean;
  /** iOS/iPadOS browser whose share sheet offers "Add to Home Screen" (`canAddToHomeScreenOnIos`). */
  iosAddToHomeScreen: boolean;
  stored: StoredInstallState;
  now: number;
};

/** The one decision. Every "no" wins over every "yes". */
export function decideInstallBanner(input: InstallBannerInputs): InstallBannerVariant {
  if (!input.routeAllowed || !input.phoneOrTablet) return "hidden";
  if (input.runningInstalled || input.relatedAppInstalled || input.stored.installed) return "hidden";
  if (input.stored.snoozedUntil !== undefined && input.stored.snoozedUntil > input.now) return "hidden";
  if (input.inAppBrowser) return "hidden";
  if (input.hasInstallPrompt) return "one-tap";
  if (input.iosAddToHomeScreen) return "ios-instructions";
  return "hidden";
}

// -- Device ---------------------------------------------------------------------------

export type DeviceSignals = {
  userAgent: string;
  /** `navigator.userAgentData?.mobile` -- true on phones; false (not absent) on Android tablets. */
  uaDataMobile?: boolean;
  maxTouchPoints: number;
  /** `matchMedia("(pointer: coarse)").matches`: the primary pointer is a finger. */
  coarsePointer: boolean;
};

const MOBILE_UA = /Android|iPhone|iPod|iPad/i;

/** iPadOS 13+ Safari asks for desktop sites and reports itself as a Mac; a real Mac has no
 * multi-touch screen. */
export function isIpadOsAsMac({ userAgent, maxTouchPoints }: Pick<DeviceSignals, "userAgent" | "maxTouchPoints">): boolean {
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * A phone or tablet: a mobile platform by Client Hints or user agent, AND a finger as the
 * primary pointer. A Windows or Chromebook laptop with a touchscreen matches neither
 * platform test, so it never counts.
 */
export function isPhoneOrTablet(signals: DeviceSignals): boolean {
  const mobilePlatform = signals.uaDataMobile === true || MOBILE_UA.test(signals.userAgent) || isIpadOsAsMac(signals);
  return mobilePlatform && signals.coarsePointer;
}

// -- Installed already ----------------------------------------------------------------

/** Display modes an installed web app runs in; a browser tab is "browser". */
export const INSTALLED_DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"] as const;

/** Running as the installed app: an installed display mode, or iOS's `navigator.standalone`. */
export function isRunningInstalled(
  matchesDisplayMode: (mode: (typeof INSTALLED_DISPLAY_MODES)[number]) => boolean,
  iosStandalone: boolean | undefined,
): boolean {
  return iosStandalone === true || INSTALLED_DISPLAY_MODES.some((mode) => matchesDisplayMode(mode));
}

// -- Browser ---------------------------------------------------------------------------

/** In-app browsers: they open links inside another app and offer no way to install. */
const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|LinkedInApp|Line\/|Twitter|MicroMessenger|Snapchat|Pinterest|GSA\/|; wv\)/i;

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_BROWSER.test(userAgent);
}

/** Third-party iOS browsers that put "Add to Home Screen" in their share sheet from iOS 16.4. */
const IOS_THIRD_PARTY_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\//;

function iosVersion(userAgent: string): [number, number] | null {
  const match = /\bOS (\d+)[_.](\d+)/.exec(userAgent);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/**
 * iOS and iPadOS have no programmatic install; the person adds the app from the share
 * sheet. Safari has offered that for years; Chrome, Firefox, Edge and Opera on iOS offer it
 * from iOS 16.4. A bare WebView (no `Safari/` token) or an in-app browser does not.
 */
export function canAddToHomeScreenOnIos(signals: Pick<DeviceSignals, "userAgent" | "maxTouchPoints">): boolean {
  const { userAgent } = signals;
  const ios = /iPhone|iPod|iPad/.test(userAgent) || isIpadOsAsMac(signals);
  if (!ios || isInAppBrowser(userAgent)) return false;
  if (IOS_THIRD_PARTY_BROWSER.test(userAgent)) {
    const version = iosVersion(userAgent);
    return version !== null && (version[0] > 16 || (version[0] === 16 && version[1] >= 4));
  }
  return /Version\/[\d.]+.*Safari\//.test(userAgent);
}

// -- Routes ----------------------------------------------------------------------------

/**
 * Routes that never carry the banner:
 * - `/p/…`: pages a business shares with its own customers (estimates, invoices, the
 *   customer centre, work requests) -- they belong to that business, not to WonderArk;
 * - `/auth/…` and `/invite/…`: sign-in callbacks and the invitation hand-off;
 * - `/platform…`: WonderArk's own administration portal, not the product;
 * - a Service job or assessment being worked on site (`/{business}/service/jobs/{id}`,
 *   `/{business}/service/assessments/{id}`), so it never pushes a field screen down mid-job.
 *   The technician's day list and every other page still show it.
 */
const EXCLUDED_ROUTES = [
  /^\/p(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/invite(\/|$)/,
  /^\/platform(\/|$)/,
  /^\/[^/]+\/service\/(jobs|assessments)\/[^/]+/,
];

export function isInstallBannerRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return !EXCLUDED_ROUTES.some((route) => route.test(pathname));
}

// -- Storage ---------------------------------------------------------------------------

/** Reads what was stored, ignoring anything malformed (a hand-edited or foreign value). */
export function parseStoredInstallState(raw: string | null | undefined): StoredInstallState {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return {};
    const { installed, snoozedUntil } = value as Record<string, unknown>;
    const state: StoredInstallState = {};
    if (installed === true) state.installed = true;
    if (typeof snoozedUntil === "number" && Number.isFinite(snoozedUntil)) state.snoozedUntil = snoozedUntil;
    return state;
  } catch {
    return {};
  }
}

export const installedState = (): StoredInstallState => ({ installed: true });

export const snoozedState = (now: number): StoredInstallState => ({ snoozedUntil: now + INSTALL_BANNER_SNOOZE_MS });
