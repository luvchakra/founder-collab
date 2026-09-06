"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@cofounderai/core/lib/utils";

/**
 * Scroll-into-view fade/slide (landing requirements #28: "Cards should gently fade/slide
 * into view... avoid excessive animation that negatively impacts performance"). A tiny
 * IntersectionObserver rather than an animation library -- justified by needing scroll
 * triggering at all, which pure CSS can't do. Respects prefers-reduced-motion by simply
 * rendering visible immediately (the global reduced-motion rule in globals.css would
 * otherwise still animate opacity/transform instantly, but skipping the observer avoids
 * the layout-affecting translate entirely for those users).
 */
export function FadeIn({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // Mount-only: `visible` here is just the initial reduced-motion check: nothing to
    // resubscribe to if it changes later, and the observer's own callback advances it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
      className={cn(
        "transition-all duration-700 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
