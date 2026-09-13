import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { Workspace } from "../../lib/tenancy/types";

/**
 * DISC-OFFER-P1 §7-01.1 "Saved Offering Discovery" -- the criteria bundle a founder
 * saves per offering (minimum score, geography/industries/buyer-roles keyword filters,
 * exclusions). Placed directly below `RediscoverySchedule` on the same offering
 * Overview page -- both are workspace-level "what should continuous discovery pay
 * attention to" settings, and belong next to each other rather than in two unrelated
 * parts of the page.
 *
 * Every filter is a plain comma-separated text field (see the server action's own
 * `parseKeywordList`), not a dedicated tag-input widget -- the simplest implementation
 * that works (CLAUDE.md dev principle #1), matching this platform's own precedent for
 * a short, infrequently-edited list (`crm`'s WhatsApp template `variables` field).
 */
export function SavedDiscoveryCriteria({
  workspace,
  updateCriteriaAction,
}: {
  workspace: Workspace;
  updateCriteriaAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border p-3 text-sm">
      <p className="font-medium">Saved discovery criteria</p>
      <p className="text-xs text-muted-foreground">
        Narrows which future discovery results matter for this offering. Leave a field blank to apply no restriction.
      </p>
      <form action={updateCriteriaAction} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minScore">Minimum score (0-100)</Label>
            <Input id="minScore" name="minScore" type="number" min={0} max={100} defaultValue={workspace.discovery_min_score ?? ""} placeholder="No minimum" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="geographyFilter">Geography (comma-separated)</Label>
            <Input id="geographyFilter" name="geographyFilter" defaultValue={workspace.discovery_geography_filter.join(", ")} placeholder="e.g. Canada, United Kingdom" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="industriesFilter">Industries (comma-separated)</Label>
            <Input id="industriesFilter" name="industriesFilter" defaultValue={workspace.discovery_industries_filter.join(", ")} placeholder="e.g. Financial Services, Healthcare" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="buyerRolesFilter">Buyer roles (comma-separated)</Label>
            <Input id="buyerRolesFilter" name="buyerRolesFilter" defaultValue={workspace.discovery_buyer_roles_filter.join(", ")} placeholder="e.g. VP Engineering, CTO" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="exclusions">Exclusions (comma-separated)</Label>
            <Input id="exclusions" name="exclusions" defaultValue={workspace.discovery_exclusions.join(", ")} placeholder="e.g. an existing customer's own name" />
          </div>
        </div>
        <div className="flex justify-end">
          <SubmitButton size="sm" variant="outline" pendingText="Saving...">
            Save criteria
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
