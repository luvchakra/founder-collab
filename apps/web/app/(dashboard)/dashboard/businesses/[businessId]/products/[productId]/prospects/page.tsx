import { notFound } from "next/navigation";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import {
  listProspects,
  listProspectIndustries,
} from "@cofounderai/module-discovery/lib/prospects/queries";
import type { ProspectStatus } from "@cofounderai/module-discovery/lib/prospects/types";
import type { ProspectStage } from "@cofounderai/module-discovery/lib/prospects/pipeline";
import { ProspectToolbarActions } from "@cofounderai/module-discovery/components/prospects/prospect-toolbar-actions";
import { ProspectsBoard } from "@cofounderai/module-discovery/components/prospects/prospects-board";
import { AutoPopulateStepBanner } from "@cofounderai/module-discovery/components/tenancy/auto-populate-step-banner";
import {
  createProspectAction,
  bulkResearchAction,
  bulkScoreAction,
  autoDiscoverOneProspectAction,
} from "./actions";

export default async function ProspectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; productId: string }>;
  searchParams: Promise<{
    status?: string;
    industry?: string;
    search?: string;
    stage?: string;
    sort?: string;
    imported?: string;
    skipped?: string;
    duplicates?: string;
    bulkAction?: string;
    bulkCompleted?: string;
    bulkSkipped?: string;
    bulkLimit?: string;
    autopopulated?: string;
    aiRestructured?: string;
  }>;
}) {
  const { businessId, productId } = await params;
  const {
    status,
    industry,
    search,
    stage,
    sort,
    imported,
    skipped,
    duplicates,
    bulkAction,
    bulkCompleted,
    bulkSkipped,
    bulkLimit,
    autopopulated,
    aiRestructured,
  } = await searchParams;

  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const sortMode = sort === "stage" || sort === "priority" ? sort : "recent";

  // `search` filters client-side (ProspectsBoard) against this already-fetched list, not
  // the DB query -- the Advanced fields (status/stage/industry/sort) still need a fresh
  // server-side fetch, since sort order and stage are computed server-side.
  const [prospects, industries] = await Promise.all([
    listProspects(
      workspace.id,
      {
        status: (status as ProspectStatus) || undefined,
        industry: industry || undefined,
        stage: (stage as ProspectStage) || undefined,
      },
      sortMode,
    ),
    listProspectIndustries(workspace.id),
  ]);

  const basePath = `/dashboard/businesses/${businessId}/products/${productId}/prospects`;
  const hasActiveFilters = Boolean(status || industry || search || stage || sort);
  const hasAdvancedFilters = Boolean(status || stage || industry || sort);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Prospects</h1>
        <ProspectToolbarActions
          importHref={`${basePath}/import`}
          discoverHref={`${basePath}/discover`}
          createAction={createProspectAction.bind(null, businessId, productId, workspace.id)}
        />
      </div>

      <AutoPopulateStepBanner
        action={autoDiscoverOneProspectAction.bind(null, businessId, productId, workspace.id)}
        nextHref={(added) => `${basePath}?autopopulated=${added}`}
        runningLabel="Searching the web for one matching prospect..."
        replace
      />

      {autopopulated ? (
        <div className="flex flex-col gap-1 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium">
            {autopopulated === "0"
              ? "Auto-populate finished, but no matching prospect was found."
              : `Auto-populate found ${autopopulated} prospect.`}
          </p>
          <p className="text-muted-foreground">
            If you are not satisfied with the search results, please review the Overview, ICP,
            and Prospects pages to update information and perform the Discover action under
            Prospects again.
          </p>
        </div>
      ) : null}

      {imported ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          Imported {imported} prospect{imported === "1" ? "" : "s"}.
          {aiRestructured === "1" ? " AI restructured the file to fit the required columns." : ""}
          {skipped && skipped !== "0" ? ` Skipped ${skipped} row(s) missing a name.` : ""}
          {duplicates && duplicates !== "0"
            ? ` Skipped ${duplicates} row(s) already in your pipeline.`
            : ""}
        </p>
      ) : null}
      {bulkAction ? (
        <p className="rounded-md border bg-muted p-3 text-sm">
          {bulkAction === "research" ? "Researched" : "Scored"} {bulkCompleted ?? 0} prospect
          {bulkCompleted === "1" ? "" : "s"}.
          {bulkSkipped && bulkSkipped !== "0"
            ? ` Skipped ${bulkSkipped} (not eligible for this step, or failed).`
            : ""}
          {bulkLimit === "1"
            ? " Stopped early -- this workspace hit its free-tier monthly AI usage limit."
            : ""}
        </p>
      ) : null}

      <ProspectsBoard
        prospects={prospects}
        basePath={basePath}
        initialSearch={search ?? ""}
        status={status ?? ""}
        stage={stage ?? ""}
        industry={industry ?? ""}
        sort={sort ?? "recent"}
        industries={industries}
        defaultAdvancedOpen={hasAdvancedFilters}
        hasActiveFilters={hasActiveFilters}
        bulkResearchAction={bulkResearchAction.bind(null, businessId, productId, workspace.id)}
        bulkScoreAction={bulkScoreAction.bind(null, businessId, productId, workspace.id)}
      />
    </div>
  );
}
