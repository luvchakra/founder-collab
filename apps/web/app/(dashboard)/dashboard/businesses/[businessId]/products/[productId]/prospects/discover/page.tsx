import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProspectSuggestions } from "@cofounderai/module-discovery/lib/prospects/queries";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
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

  const suggestions = await listProspectSuggestions(workspace.id);
  const prospectsPath = `/dashboard/businesses/${businessId}/products/${productId}/prospects`;

  return (
    <div className="flex flex-col gap-6">
      <Link href={prospectsPath} className="text-sm text-muted-foreground hover:underline">
        ← Back to prospects
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
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
        />
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
            <ul className="flex flex-col gap-3">
              {suggestions.map((s) => (
                <li key={s.id} className="flex gap-3 rounded-md border p-4">
                  <input
                    type="checkbox"
                    name="ids"
                    value={s.id}
                    defaultChecked
                    className="mt-1 size-4"
                  />
                  <div className="flex flex-col gap-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.company_name}</span>
                      {s.website ? (
                        <a
                          href={s.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground underline"
                        >
                          {s.website}
                        </a>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground">
                      {[s.industry, s.company_size, s.location].filter(Boolean).join(" · ") ||
                        "—"}
                    </p>
                    {s.description ? <p>{s.description}</p> : null}
                    {s.match_reason ? (
                      <p className="rounded-md bg-primary/5 p-2 text-xs">
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
                  </div>
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
