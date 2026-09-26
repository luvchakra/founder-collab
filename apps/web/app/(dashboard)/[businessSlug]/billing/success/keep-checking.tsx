"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page every few seconds while confirmation is pending; stops after two
 * minutes and says what to do rather than spinning forever. */
export function KeepChecking() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 120_000) {
        window.clearInterval(timer);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [router]);
  return gaveUp ? (
    <p className="text-sm text-muted-foreground">
      Confirmation is taking longer than usual. You don&apos;t need to pay again — your plan updates on its own as soon as the
      payment is confirmed. If it hasn&apos;t within an hour, contact support.
    </p>
  ) : null;
}
