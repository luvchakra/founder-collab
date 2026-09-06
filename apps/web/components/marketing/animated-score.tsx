"use client";

import { useEffect, useRef, useState } from "react";

/** "Scores animate from 0 -> final score" (landing requirements #28), triggered once
 * the score enters the viewport. Skips animating for prefers-reduced-motion. */
export function AnimatedScore({ target, durationMs = 900 }: { target: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? target
      : 0,
  );

  useEffect(() => {
    if (value === target) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        function tick(now: number) {
          const progress = Math.min(1, (now - start) / durationMs);
          setValue(Math.round(target * progress));
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `value` deliberately excluded: it's the initial reduced-motion check plus the
    // animation's own running total, neither of which should retrigger this setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return <span ref={ref}>{value}</span>;
}
