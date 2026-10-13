"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { orgInternalPath } from "../../lib/org-address";

/**
 * PLATFORM-P1-10.1: on an organization's address the browser shows `/discovery` while the
 * app's routes (and every path comparison in the shell and modules) are `/<slug>/discovery`.
 * The dashboard layout provides the address's slug; `useAppPathname()` gives components the
 * route-shaped path either way, so nothing else needs to know which host it is on.
 */
const OrgAddressContext = createContext<string | null>(null);

export function OrgAddressProvider({ hostSlug, children }: { hostSlug: string | null; children: ReactNode }) {
  return <OrgAddressContext.Provider value={hostSlug}>{children}</OrgAddressContext.Provider>;
}

/** The organization slug of the address being used, or null on the main address. */
export function useHostSlug(): string | null {
  return useContext(OrgAddressContext);
}

/** `usePathname()`, in the app's route shape (`/<slug>/...`) on an organization's address too. */
export function useAppPathname(): string {
  const pathname = usePathname() ?? "";
  const slug = useContext(OrgAddressContext);
  if (!slug || pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) return pathname;
  return orgInternalPath(pathname, slug) ?? pathname;
}
