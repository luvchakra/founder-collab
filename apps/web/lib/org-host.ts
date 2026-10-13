import { headers } from "next/headers";
import { baseAppHost, parseHost, type HostTarget } from "@cofounderai/core/lib/org-address";
import { resolveOrgHost, type HostBusiness } from "@cofounderai/core/db/org-host-lookup";

/**
 * PLATFORM-P1-10.1/10.2: which organization's address this request came in on, for server
 * code (pages, auth actions). The address only picks a business; membership authorizes.
 */
export async function getRequestHost(): Promise<{ target: HostTarget; base: string | null; protocol: string; port: string | undefined }> {
  const h = await headers();
  const base = baseAppHost();
  const rawHost = h.get("host") ?? "";
  const target = parseHost(rawHost, base);
  const protocol = h.get("x-forwarded-proto") ?? (rawHost.includes("localhost") ? "http" : "https");
  const port = rawHost.match(/:(\d+)$/)?.[1];
  return { target, base, protocol, port };
}

/** The business at this request's organization address, or null on the main address (or when
 * addresses are off). `{ missing: true }` when an organization address has nothing behind it. */
export async function getHostBusiness(): Promise<HostBusiness | { missing: true } | null> {
  const { target } = await getRequestHost();
  if (target.kind === "invalid") return { missing: true };
  if (target.kind !== "organization") return null;
  return (await resolveOrgHost(target.label)) ?? { missing: true };
}

/** Whether this request came in on an organization's address. */
export async function onOrgAddress(): Promise<boolean> {
  return (await getRequestHost()).target.kind === "organization";
}
