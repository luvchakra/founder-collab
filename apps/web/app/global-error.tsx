"use client";

import { BRAND_HEX } from "@cofounderai/core/brand/identity";
import { BRAND_ICON } from "@cofounderai/core/brand/generated/assets";

/**
 * The one boundary that catches an error thrown by the root layout itself (or
 * anything above every other error.tsx in the tree) -- Next.js requires this file to
 * render its own complete `<html>/<body>`, since triggering it means the real root
 * layout didn't render at all. Deliberately minimal and dependency-free (no
 * ThemeProvider, no shared UI components, inline styles only) -- if the root layout
 * itself is what failed, this boundary should not lean on anything that could fail the
 * same way. This is the platform's true last resort; every other route already has its
 * own error.tsx (dashboard, auth, onboarding, the public /p/** routes) that should
 * catch things first.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: BRAND_HEX.dark }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            minHeight: "100vh",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          {/* Platform identity on the last-resort error page (§29). A plain <img> of the
              fixed-name icon: nothing here may depend on next/image or the stylesheet. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND_ICON.favicon64} alt="WonderArk" width={64} height={64} />
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: BRAND_HEX.slate, margin: 0 }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "none",
              background: BRAND_HEX.blue,
              color: "white",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
