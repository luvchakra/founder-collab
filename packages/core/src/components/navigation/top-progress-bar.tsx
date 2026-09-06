"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "../../lib/utils";

/**
 * A thin top-of-viewport progress bar for link/tab navigation -- the App Router has no
 * "navigation started" event of its own (unlike the old Pages Router), so this listens
 * for clicks on same-origin, same-tab anchor tags (every next/link renders as one,
 * including every tab and row link in this app) and clears once the pathname/search
 * params actually change. Form-action buttons already get their own per-button pending
 * state from SubmitButton -- this only covers the gap that leaves: plain navigation.
 */
export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      setState("loading");
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    // Synchronizing with the router's own navigation-complete signal (pathname/search
    // params changing) is exactly what this effect exists for -- there's no render-time
    // alternative to "clear the bar once the URL actually changed".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => (prev === "idle" ? prev : "done"));
  }, [pathname, searchParams]);

  useEffect(() => {
    if (state !== "done") return;
    const timeout = setTimeout(() => setState("idle"), 200);
    return () => clearTimeout(timeout);
  }, [state]);

  if (state === "idle") return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
    >
      <div
        className={cn(
          "h-full bg-primary ease-out",
          state === "loading" ? "w-4/5 transition-[width] duration-[8000ms]" : "w-full transition-[width] duration-200",
        )}
      />
    </div>
  );
}
