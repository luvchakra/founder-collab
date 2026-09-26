"use client";

import { usePathname, useRouter } from "next/navigation";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { offeringSwitchHref } from "../../lib/offerings/context";

/**
 * DISC-OFFER-P0-03.1 "Offering Context Selector" -- in the offering header, next to its
 * name: which offering this page is about, and a one-step switch to another offering of
 * the same business that keeps the section you are in (the rail's offering list opens an
 * offering's overview instead). The business itself is the topbar's business switcher.
 * A native select: usable at every width with no separate mobile treatment. Hidden when
 * the business has one offering -- there is nothing to switch to.
 *
 * Results never leak across the switch: every page under an offering reads its data
 * server-side by that offering's own workspace (RLS-enforced), and the offering segment
 * of the route re-renders from scratch for the new id.
 */
export function OfferingContextSelector({
  offeringsBasePath,
  currentOfferingId,
  offerings,
}: {
  /** `/<businessSlug>/discovery/offerings` */
  offeringsBasePath: string;
  currentOfferingId: string;
  offerings: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  if (offerings.length <= 1) return null;

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <label htmlFor="offering-context" className="shrink-0 text-xs font-medium text-muted-foreground uppercase">
        Offering
      </label>
      <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
        <NativeSelect
          id="offering-context"
          value={currentOfferingId}
          onChange={(event) => router.push(offeringSwitchHref(offeringsBasePath, pathname, currentOfferingId, event.target.value))}
        >
          {offerings.map((offering) => (
            <option key={offering.id} value={offering.id}>
              {offering.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
