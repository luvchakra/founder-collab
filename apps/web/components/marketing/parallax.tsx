"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * Scroll-linked vertical drift (the classic Apple.com hero technique: content moves at a
 * slightly different rate than the page scroll, reading as depth rather than a flat
 * scroll). `strength` is the max travel in pixels as the element crosses the viewport.
 * Scroll-driven, not IntersectionObserver-driven, since it needs continuous position, not
 * a one-time enter/exit -- rAF-throttled so it never runs more than once per frame.
 */
export function Parallax({
  children,
  strength = 30,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const node = ref.current;
    if (!node) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = node.getBoundingClientRect();
      const viewportMid = window.innerHeight / 2;
      const elementMid = rect.top + rect.height / 2;
      const progress = (elementMid - viewportMid) / window.innerHeight;
      setOffset(progress * strength);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [prefersReducedMotion, strength]);

  return (
    <div
      ref={ref}
      className={className}
      style={prefersReducedMotion ? undefined : { transform: `translate3d(0, ${offset}px, 0)` }}
    >
      {children}
    </div>
  );
}
