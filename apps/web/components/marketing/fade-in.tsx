"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@cofounderai/core/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * Scroll-into-view fade/slide (landing requirements #28: "Cards should gently fade/slide
 * into view... avoid excessive animation that negatively impacts performance"). A tiny
 * IntersectionObserver rather than an animation library -- justified by needing scroll
 * triggering at all, which pure CSS can't do. Respects prefers-reduced-motion by simply
 * rendering visible immediately.
 */
export function FadeIn({
  children,
  delayMs = 0,
  scale = false,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  /** Also grows in from a slight zoom-out, for a hero/product-reveal feel. */
  scale?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  const visible = prefersReducedMotion || inView;

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
      className={cn(
        "transition-all duration-700 ease-out",
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : scale
            ? "translate-y-4 scale-[0.97] opacity-0"
            : "translate-y-4 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
