import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProspectSuggestions } from "@cofounderai/module-discovery/lib/prospects/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { AiActionForm } from "@cofounderai/module-discovery/components/ai/ai-action-form";
import {
  runDiscoveryAction,
  approveSuggestionsAction,
  discardSuggestionsAction,
} from "./actions";

export default async function DiscoverProspectsPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const [suggestions, icp] = await Promise.all([
    listProspectSuggestions(workspace.id),
    getIcpProfile(workspace.id),
  ]);
  const prospectsPath = `/dashboard/businesses/${businessId}/products/${productId}/prospects`;

  return (
    <div className="flex flex-col gap-6">
      <Link href={prospectsPath} className="text-sm text-muted-foreground hover:underline">
        ← Back to prospects
      </Link>

      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-medium">Discover prospects</h1>
          <p className="text-sm text-muted-foreground">
            Searches the web for companies matching your approved ICP. Nothing is
            added to your pipeline until you review and approve it below.
          </p>
        </div>

        <AiActionForm
          action={runDiscoveryAction.bind(null, businessId, productId, workspace.id)}
          buttonLabel="Find 10 new prospects"
          pendingText="Searching the web..."
          buttonProps={{ size: "default" }}
          formClassName="flex flex-col gap-3"
          wrapperClassName="flex flex-col items-start gap-2 rounded-md border p-4"
        >
          <p className="text-sm font-medium">Narrow this search (optional)</p>
          <p className="text-xs text-muted-foreground">
            Leave a field blank to fall back to your ICP&apos;s own criteria.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                name="industry"
                placeholder={icp?.industries.join(", ") || "e.g. Fintech, Healthcare"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="companySize">Company size</Label>
              <Input
                id="companySize"
                name="companySize"
                placeholder={icp?.company_sizes.join(", ") || "e.g. 50-500 employees"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                placeholder={icp?.geographies.join(", ") || "e.g. Bengaluru, India"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="keywords">Also look for</Label>
              <Input id="keywords" name="keywords" placeholder="e.g. recently raised funding" />
            </div>
          </div>
        </AiActionForm>
      </div>

      {suggestions.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No suggestions waiting for review yet. Click &ldquo;Find 10 new
          prospects&rdquo; to search.
        </p>
      ) : (
        <>
          <form
            action={approveSuggestionsAction.bind(null, businessId, productId, workspace.id)}
            className="flex flex-col gap-4"
          >
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((s) => (
                <li key={s.id} className="relative flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                  <input
                    type="checkbox"
                    name="ids"
                    value={s.id}
                    defaultChecked
                    className="absolute top-3 right-3 size-4"
                  />
                  <span className="pr-6 font-medium">{s.company_name}</span>
                  {s.website ? (
                    <a
                      href={s.website}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-xs text-muted-foreground underline"
                    >
                      {s.website}
                    </a>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {[s.industry, s.company_size, s.location].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {s.description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                  ) : null}
                  {s.match_reason ? (
                    <p className="line-clamp-2 rounded-md bg-primary/5 p-1.5 text-xs">
                      <span className="font-medium">Why this fits: </span>
                      {s.match_reason}
                    </p>
                  ) : null}
                  {s.source_url ? (
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline"
                    >
                      Source
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            <SubmitButton pendingText="Adding..." className="self-start">
              Add selected to prospects
            </SubmitButton>
          </form>

          <form
            action={discardSuggestionsAction.bind(null, businessId, productId, workspace.id)}
          >
            {suggestions.map((s) => (
              <input key={s.id} type="hidden" name="ids" value={s.id} />
            ))}
            <SubmitButton variant="ghost" size="sm" pendingText="Discarding...">
              Discard all suggestions
            </SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
