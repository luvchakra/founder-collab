"use client";

import { usePathname, useRouter } from "next/navigation";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import type { Offering } from "../../lib/offerings/types";

/** Tab suffixes that exist under every offering -- preserved across a switch so
 * "context persists through relevant navigation" (DISC-OFFER-P0-03.1). Anything deeper
 * (e.g. a specific prospect id) is dropped, since that specific record won't exist under
 * the other offering -- falls back to that tab's own root instead. */
const KNOWN_TABS = ["icp", "prospects", "conversions", "usage"];

/**
 * DISC-OFFER-P0-03.1 "Offering Context Selector" -- lets a founder jump straight to
 * another offering in the same business without going back to the Business page first.
 * A plain `NativeSelect` rather than a custom dropdown: it's already this platform's own
 * convention for a compact picker (see `CloneIcpButton`'s offering picker), and it's
 * usable at any width with no extra mobile handling needed. Hidden entirely when there's
 * only one offering -- nothing to switch to.
 */
export function OfferingSwitcher({
  businessId,
  currentOfferingId,
  offerings,
}: {
  businessId: string;
  currentOfferingId: string;
  offerings: Offering[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  if (offerings.length <= 1) return null;

  function targetPath(offeringId: string) {
    const marker = `/products/${currentOfferingId}`;
    const markerIndex = pathname.indexOf(marker);
    const suffix = markerIndex === -1 ? "" : pathname.slice(markerIndex + marker.length);
    const firstSegment = suffix.split("/").filter(Boolean)[0];
    const tab = firstSegment && KNOWN_TABS.includes(firstSegment) ? `/${firstSegment}` : "";
    return `/dashboard/businesses/${businessId}/products/${offeringId}${tab}`;
  }

  return (
    <NativeSelect
      aria-label="Switch offering"
      value={currentOfferingId}
      onChange={(e) => router.push(targetPath(e.target.value))}
      className="h-8 w-auto max-w-52 text-sm"
    >
      {offerings.map((offering) => (
        <option key={offering.id} value={offering.id}>
          {offering.name}
        </option>
      ))}
    </NativeSelect>
  );
}
