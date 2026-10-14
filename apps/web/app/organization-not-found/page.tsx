import type { Metadata } from "next";
import { WonderArkLogo } from "@cofounderai/core/shell/wonderark-logo";
import { SITE_URL } from "@cofounderai/core/site";

export const metadata: Metadata = { title: "No organization here", robots: { index: false } };

// PLATFORM-P1-10.1: what an organization address with nothing behind it answers (404, set by
// the proxy's rewrite).
export default function OrganizationNotFoundPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <WonderArkLogo variant="primary" size="xs" adaptive priority className="mb-3" />
      <h1 className="text-2xl font-semibold">No organization at this address</h1>
      <p className="text-muted-foreground">Check the address, or sign in on the main site to find your organization.</p>
      <a href={SITE_URL} className="text-sm underline underline-offset-2">
        Go to the main site
      </a>
    </main>
  );
}
