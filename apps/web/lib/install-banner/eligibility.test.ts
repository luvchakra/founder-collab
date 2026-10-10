import { describe, expect, it } from "vitest";
import {
  INSTALL_BANNER_SNOOZE_MS,
  canAddToHomeScreenOnIos,
  decideInstallBanner,
  isInAppBrowser,
  isInstallBannerRoute,
  isPhoneOrTablet,
  isRunningInstalled,
  parseStoredInstallState,
  snoozedState,
  type DeviceSignals,
  type InstallBannerInputs,
} from "./eligibility";

/** BRAND-13 -- when the install banner shows, from what each kind of browser reports. */

const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneChromeOld:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.6]",
  iphoneLinkedIn:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LinkedInApp/9.30",
  iphoneWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  ipadOsAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

const phone = (userAgent: string, extra: Partial<DeviceSignals> = {}): DeviceSignals => ({
  userAgent,
  maxTouchPoints: 5,
  coarsePointer: true,
  ...extra,
});

const NOW = 1_800_000_000_000;

/** A Chromium phone in a browser tab, nothing remembered, no install prompt yet. */
const base: InstallBannerInputs = {
  routeAllowed: true,
  phoneOrTablet: true,
  runningInstalled: false,
  relatedAppInstalled: false,
  inAppBrowser: false,
  hasInstallPrompt: false,
  iosAddToHomeScreen: false,
  stored: {},
  now: NOW,
};

/** The decision for a real user agent, end to end through the detection helpers. */
function decideFor(signals: DeviceSignals, overrides: Partial<InstallBannerInputs> = {}) {
  return decideInstallBanner({
    ...base,
    phoneOrTablet: isPhoneOrTablet(signals),
    inAppBrowser: isInAppBrowser(signals.userAgent),
    iosAddToHomeScreen: canAddToHomeScreenOnIos(signals),
    ...overrides,
  });
}

describe("decideInstallBanner", () => {
  it("Chromium phone with a captured beforeinstallprompt -> one-tap install", () => {
    expect(decideFor(phone(UA.chromeAndroid, { uaDataMobile: true }), { hasInstallPrompt: true })).toBe("one-tap");
    expect(decideFor(phone(UA.samsungInternet), { hasInstallPrompt: true })).toBe("one-tap");
  });

  it("Android tablet (userAgentData.mobile is false there) with the event -> one-tap install", () => {
    expect(decideFor(phone(UA.chromeAndroidTablet, { uaDataMobile: false }), { hasInstallPrompt: true })).toBe("one-tap");
  });

  it("Chromium phone before (or without) beforeinstallprompt -> hidden: not installable, or already installed", () => {
    expect(decideFor(phone(UA.chromeAndroid, { uaDataMobile: true }))).toBe("hidden");
  });

  it("iPhone Safari -> Add to Home Screen instructions", () => {
    expect(decideFor(phone(UA.iphoneSafari))).toBe("ios-instructions");
  });

  it("iPad reporting itself as a Mac -> instructions; a real Mac -> hidden", () => {
    expect(decideFor(phone(UA.ipadOsAsMac, { maxTouchPoints: 5 }))).toBe("ios-instructions");
    expect(decideFor({ userAgent: UA.macSafari, maxTouchPoints: 0, coarsePointer: false })).toBe("hidden");
  });

  it("Chrome on iOS 16.4+ -> instructions; before 16.4 it has no Add to Home Screen -> hidden", () => {
    expect(decideFor(phone(UA.iphoneChrome))).toBe("ios-instructions");
    expect(decideFor(phone(UA.iphoneChromeOld))).toBe("hidden");
  });

  it("desktop -> hidden, even with an install prompt or a touchscreen", () => {
    const desktop = { userAgent: UA.windowsChrome, uaDataMobile: false, maxTouchPoints: 0, coarsePointer: false };
    expect(decideFor(desktop, { hasInstallPrompt: true })).toBe("hidden");
    const touchLaptop = { userAgent: UA.windowsChrome, uaDataMobile: false, maxTouchPoints: 10, coarsePointer: true };
    expect(decideFor(touchLaptop, { hasInstallPrompt: true })).toBe("hidden");
  });

  it("running as the installed app -> hidden", () => {
    expect(decideFor(phone(UA.chromeAndroid), { hasInstallPrompt: true, runningInstalled: true })).toBe("hidden");
    expect(decideFor(phone(UA.iphoneSafari), { runningInstalled: true })).toBe("hidden");
  });

  it("getInstalledRelatedApps reports the app installed -> hidden", () => {
    expect(decideFor(phone(UA.chromeAndroid), { hasInstallPrompt: true, relatedAppInstalled: true })).toBe("hidden");
  });

  it("Firefox on Android (no install prompt) -> hidden", () => {
    expect(decideFor(phone(UA.firefoxAndroid))).toBe("hidden");
  });

  it("in-app browsers and bare WebViews -> hidden, on Android and iOS", () => {
    expect(decideFor(phone(UA.instagramAndroid), { hasInstallPrompt: true })).toBe("hidden");
    expect(decideFor(phone(UA.androidWebView), { hasInstallPrompt: true })).toBe("hidden");
    expect(decideFor(phone(UA.iphoneFacebook))).toBe("hidden");
    expect(decideFor(phone(UA.iphoneLinkedIn))).toBe("hidden");
    expect(decideFor(phone(UA.iphoneWebView))).toBe("hidden");
  });

  it("installed on this browser -> hidden for good", () => {
    expect(decideFor(phone(UA.iphoneSafari), { stored: { installed: true } })).toBe("hidden");
    expect(decideFor(phone(UA.chromeAndroid), { hasInstallPrompt: true, stored: { installed: true } })).toBe("hidden");
  });

  it("dismissed or declined -> hidden for 14 days, then shown again", () => {
    const snoozed = snoozedState(NOW);
    expect(snoozed.snoozedUntil).toBe(NOW + INSTALL_BANNER_SNOOZE_MS);
    expect(INSTALL_BANNER_SNOOZE_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(decideFor(phone(UA.chromeAndroid), { hasInstallPrompt: true, stored: snoozed })).toBe("hidden");
    expect(
      decideFor(phone(UA.chromeAndroid), { hasInstallPrompt: true, stored: snoozed, now: NOW + INSTALL_BANNER_SNOOZE_MS + 1 }),
    ).toBe("one-tap");
  });

  it("excluded route -> hidden", () => {
    expect(decideFor(phone(UA.iphoneSafari), { routeAllowed: false })).toBe("hidden");
  });
});

describe("isRunningInstalled", () => {
  it("is true in any installed display mode or with iOS navigator.standalone", () => {
    for (const mode of ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"]) {
      expect(isRunningInstalled((m) => m === mode, undefined)).toBe(true);
    }
    expect(isRunningInstalled(() => false, true)).toBe(true);
    expect(isRunningInstalled(() => false, false)).toBe(false);
    expect(isRunningInstalled(() => false, undefined)).toBe(false);
  });
});

describe("isInstallBannerRoute", () => {
  it("shows on public pages and inside the app", () => {
    for (const path of ["/", "/pricing", "/help", "/help/getting-started", "/login", "/dashboard", "/acme", "/acme/service/my-day", "/acme/service/jobs", "/acme/crm"]) {
      expect(isInstallBannerRoute(path), path).toBe(true);
    }
  });

  it("never shows on customer-facing, auth hand-off, platform-admin or on-site job pages", () => {
    for (const path of [
      "/p/e/tok123",
      "/p/i/tok123",
      "/p/center/tok123",
      "/p/request/acme",
      "/auth/callback",
      "/invite/tok123",
      "/platform",
      "/platform/businesses",
      "/acme/service/jobs/0b5c",
      "/acme/service/assessments/42",
    ]) {
      expect(isInstallBannerRoute(path), path).toBe(false);
    }
    expect(isInstallBannerRoute(null)).toBe(false);
  });

  it("does not mistake look-alike business slugs for excluded prefixes", () => {
    expect(isInstallBannerRoute("/pottery-co/dashboard")).toBe(true);
    expect(isInstallBannerRoute("/platformer/dashboard")).toBe(true);
  });
});

describe("parseStoredInstallState", () => {
  it("reads what the banner wrote and ignores anything else", () => {
    expect(parseStoredInstallState(JSON.stringify({ installed: true }))).toEqual({ installed: true });
    expect(parseStoredInstallState(JSON.stringify({ snoozedUntil: 5 }))).toEqual({ snoozedUntil: 5 });
    expect(parseStoredInstallState(null)).toEqual({});
    expect(parseStoredInstallState("not json")).toEqual({});
    expect(parseStoredInstallState(JSON.stringify({ installed: "yes", snoozedUntil: "soon" }))).toEqual({});
    expect(parseStoredInstallState("42")).toEqual({});
  });
});
