"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Ellipsis, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { BRAND_ICON } from "@cofounderai/core/brand/generated/assets";
import {
  APP_INSTALLED_EVENT,
  INSTALL_BANNER_STORAGE_KEY,
  INSTALL_PROMPT_READY_EVENT,
  INSTALLED_DISPLAY_MODES,
  canAddToHomeScreenOnIos,
  decideInstallBanner,
  installedState,
  isInAppBrowser,
  isInstallBannerRoute,
  isPhoneOrTablet,
  isRunningInstalled,
  parseStoredInstallState,
  snoozedState,
  type StoredInstallState,
} from "@/lib/install-banner/eligibility";

/** Chromium's install event (not in TypeScript's DOM library). */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface Window {
    /** Set by InstallPromptCaptureScript; null once used or installed. */
    __wonderarkInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

type BrowserFacts = {
  phoneOrTablet: boolean;
  runningInstalled: boolean;
  inAppBrowser: boolean;
  iosAddToHomeScreen: boolean;
};

function readBrowserFacts(): BrowserFacts {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean }; standalone?: boolean };
  const signals = {
    userAgent: nav.userAgent,
    uaDataMobile: nav.userAgentData?.mobile,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
  };
  return {
    phoneOrTablet: isPhoneOrTablet(signals),
    runningInstalled: isRunningInstalled((mode) => window.matchMedia(`(display-mode: ${mode})`).matches, nav.standalone),
    inAppBrowser: isInAppBrowser(nav.userAgent),
    iosAddToHomeScreen: canAddToHomeScreenOnIos(signals),
  };
}

/** Storage can be blocked (private modes, policies); the banner then simply forgets. */
function readStored(): StoredInstallState {
  try {
    return parseStoredInstallState(window.localStorage.getItem(INSTALL_BANNER_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeStored(state: StoredInstallState) {
  try {
    window.localStorage.setItem(INSTALL_BANNER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Nothing to do: without storage the banner may come back on the next visit.
  }
}

/**
 * BRAND-13 -- reads the browser once on mount (nothing renders on the server, so there is
 * no hydration mismatch), re-checks when a captured install prompt arrives or the display
 * mode changes, and asks `getInstalledRelatedApps` before showing anything in a browser
 * that supports it, so an installed app never sees the invitation flash up.
 */
function useInstallBanner() {
  const pathname = usePathname();
  const [facts, setFacts] = useState<BrowserFacts | null>(null);
  const [relatedAppInstalled, setRelatedAppInstalled] = useState<boolean | null>(null);
  const [hasInstallPrompt, setHasInstallPrompt] = useState(false);
  const [stored, setStored] = useState<StoredInstallState>({});
  const [now, setNow] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (!active) return;
      setFacts(readBrowserFacts());
      setStored(readStored());
      setHasInstallPrompt(Boolean(window.__wonderarkInstallPrompt));
      setNow(Date.now());
    };

    // Asked first, so an installed app's own browser tab never flashes the invitation.
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
    const relatedApps =
      typeof nav.getInstalledRelatedApps === "function"
        ? nav.getInstalledRelatedApps().then((apps) => apps.length > 0, () => false)
        : Promise.resolve(false);
    void relatedApps.then((installed) => {
      if (!active) return;
      setRelatedAppInstalled(installed);
      refresh();
    });

    const onInstalled = () => {
      setStored(installedState());
      setHasInstallPrompt(false);
    };
    const queries = INSTALLED_DISPLAY_MODES.map((mode) => window.matchMedia(`(display-mode: ${mode})`));
    window.addEventListener(INSTALL_PROMPT_READY_EVENT, refresh);
    window.addEventListener(APP_INSTALLED_EVENT, onInstalled);
    for (const query of queries) query.addEventListener("change", refresh);
    return () => {
      active = false;
      window.removeEventListener(INSTALL_PROMPT_READY_EVENT, refresh);
      window.removeEventListener(APP_INSTALLED_EVENT, onInstalled);
      for (const query of queries) query.removeEventListener("change", refresh);
    };
  }, []);

  const variant =
    facts && relatedAppInstalled !== null
      ? decideInstallBanner({
          ...facts,
          routeAllowed: isInstallBannerRoute(pathname),
          relatedAppInstalled,
          hasInstallPrompt,
          stored,
          now,
        })
      : "hidden";

  const remember = useCallback((state: StoredInstallState) => {
    writeStored(state);
    setStored(state);
  }, []);

  const install = useCallback(async () => {
    const promptEvent = window.__wonderarkInstallPrompt;
    if (!promptEvent) return;
    // An install prompt can be shown once; the browser fires a fresh event if it may ask again.
    window.__wonderarkInstallPrompt = null;
    setHasInstallPrompt(false);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      remember(outcome === "accepted" ? installedState() : snoozedState(Date.now()));
    } catch {
      remember(snoozedState(Date.now()));
    }
  }, [remember]);

  return {
    variant,
    install,
    dismiss: () => remember(snoozedState(Date.now())),
    markAdded: () => remember(installedState()),
  };
}

/**
 * The fixed rail (`lg` and up) starts below whatever part of the banner is still on screen,
 * so the banner pushes the whole shell down instead of sliding under the rail. Phones and
 * portrait tablets have no fixed rail; the banner just scrolls away with the page there.
 */
function useRailOffset(banner: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const bottom = banner.current?.getBoundingClientRect().bottom ?? 0;
      root.style.setProperty("--install-banner-offset", `${Math.max(0, Math.round(bottom))}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    if (banner.current) observer.observe(banner.current);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root.style.removeProperty("--install-banner-offset");
    };
  }, [banner, active]);
}

/** The iOS share glyph, as Safari draws it, for the instruction line. */
function ShareGlyph() {
  return (
    <span className="mx-0.5 inline-flex translate-y-[-1px] items-center align-middle text-primary">
      <Share className="size-4" aria-hidden="true" />
      <span className="sr-only">Share</span>
    </span>
  );
}

/**
 * BRAND-13 -- "install the app", at the very top of the page on phones and tablets.
 * Everything about *whether* it shows lives in lib/install-banner/eligibility.ts.
 */
export function InstallBanner() {
  const { variant, install, dismiss, markAdded } = useInstallBanner();
  const [showSteps, setShowSteps] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const stepsId = useId();
  const visible = variant !== "hidden";
  useRailOffset(ref, visible);

  if (!visible) return null;
  const ios = variant === "ios-instructions";

  return (
    <div
      ref={ref}
      role="region"
      aria-label={`Install the ${BRAND_NAME} app`}
      className="w-full shrink-0 border-b border-border bg-card text-card-foreground shadow-xs pt-[env(safe-area-inset-top)] print:hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 py-2 pr-1 pl-4 sm:pl-6">
        <Image
          src={BRAND_ICON.icon192}
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-[22%] border border-border"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-semibold">{BRAND_NAME}</p>
          <p className="text-xs leading-snug text-muted-foreground">
            {ios ? "Add it to your Home Screen. Opens full screen." : "Full screen, one tap from your home screen."}
          </p>
        </div>
        {ios ? (
          <Button
            variant="outline"
            className="h-11 shrink-0 px-3"
            aria-expanded={showSteps}
            aria-controls={stepsId}
            onClick={() => setShowSteps((open) => !open)}
          >
            How to
          </Button>
        ) : (
          <Button className="h-11 shrink-0 px-4" onClick={install}>
            Install
          </Button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          title="Not now"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      {ios && showSteps ? (
        <div id={stepsId} className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
          <div className="flex items-center gap-2 rounded-lg bg-muted py-1.5 pr-1.5 pl-3">
            <ol className="min-w-0 flex-1 space-y-1 text-sm">
              <li className="flex flex-wrap items-center gap-x-1">
                <span className="font-medium">1.</span> Tap <ShareGlyph />
                <span className="text-xs text-muted-foreground">
                  (under <Ellipsis className="inline size-3.5 align-middle" aria-hidden="true" />
                  <span className="sr-only">More</span> if hidden)
                </span>
              </li>
              <li className="flex flex-wrap items-center gap-x-1">
                <span className="font-medium">2.</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <SquarePlus className="size-4" aria-hidden="true" />
                  Add to Home Screen
                </span>
              </li>
            </ol>
            <Button variant="outline" className="h-11 shrink-0 px-3" onClick={markAdded}>
              I&apos;ve added it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
