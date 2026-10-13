import type { Metadata } from "next";
import { WonderArkLogo } from "@cofounderai/core/shell/wonderark-logo";
import { SITE_URL } from "@cofounderai/core/site";
import { getHostBusiness } from "@/lib/org-host";

export const metadata: Metadata = { title: "Organization paused", robots: { index: false } };
export const dynamic = "force-dynamic";

// PLATFORM-P1-10.2: an organization that is suspended, or disabled by its owner, is hidden and
// refuses sign-in (owner decision 2026-10-13: not enforced in RLS). Its owner re-enables it from
// Manage organizations on the main site.
export default async function OrganizationPausedPage() {
  const business = await getHostBusiness().catch(() => null);
  const name = business && !("missing" in business) ? business.name : "This organization";
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <WonderArkLogo variant="primary" size="xs" adaptive priority className="mb-3" />
      <h1 className="text-2xl font-semibold">{name} is paused</h1>
      <p className="text-muted-foreground">It has been disabled, so nobody can use it for now. Its owner can turn it back on from Manage organizations.</p>
      <a href={`${SITE_URL}/dashboard/organizations`} className="text-sm underline underline-offset-2">
        Manage organizations
      </a>
    </main>
  );
}
