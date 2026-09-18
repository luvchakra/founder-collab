"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@cofounderai/core/db/client";

/**
 * Consumes a recovery link that delivers its session in the URL fragment
 * (`#access_token=…&type=recovery`) rather than as a `?code=`/`?token_hash=` the server
 * can read. Every recovery link generated outside this app's own request arrives that
 * way — including "Send password recovery" from the Supabase dashboard — and a fragment
 * is never sent to the server, so without this the page would tell a founder holding a
 * perfectly good link that it had expired.
 *
 * Renders `children` (the page's own "this link is invalid or has expired" copy) only
 * once it knows there is no fragment to consume, so a working link never flashes that
 * message on its way in.
 */
export function RecoveryHashHandler({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "consuming" | "nothing-to-consume">(
    "checking",
  );
  // Reading the fragment destroys it, so this must happen exactly once. React runs
  // effects twice in development, and without this guard the second pass would find the
  // fragment already stripped and declare a link that is working "expired".
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) {
      // The fragment is invisible to the server, so "is there a link to consume?" cannot
      // be answered at render time without breaking hydration -- settling it on mount is
      // what this effect is for, and it runs once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("nothing-to-consume");
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const error = params.get("error_description") ?? params.get("error");

    // Tokens in the address bar end up in history and in anything reading the URL, so
    // drop the fragment as soon as it has been read, whatever it turned out to hold.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    if (error) {
      router.replace(`/forgot-password?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!accessToken || !refreshToken) {
      setState("nothing-to-consume");
      return;
    }

    setState("consuming");
    void createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          router.replace(`/forgot-password?error=${encodeURIComponent(sessionError.message)}`);
          return;
        }
        // The session is now in a cookie; re-render the server component so it sees it
        // and swaps this placeholder for the new-password form.
        router.refresh();
      });
  }, [router]);

  if (state === "consuming") {
    return <p className="text-sm text-landing-muted">Checking your reset link...</p>;
  }
  if (state === "checking") {
    return null;
  }
  return <>{children}</>;
}
