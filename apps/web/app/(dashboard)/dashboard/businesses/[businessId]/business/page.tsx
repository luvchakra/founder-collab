import { notFound } from "next/navigation";
import { Globe, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  getBusiness,
  getWorkspaceForProduct,
  listProducts,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getProspectCounts } from "@cofounderai/module-discovery/lib/prospects/queries";
import {
  getLatestWebsiteOnboardingRun,
  listWebsiteOnboardingPages,
} from "@cofounderai/module-discovery/lib/website-onboarding/queries";
import {
  renameBusinessAction,
  updateBusinessDescriptionAction,
  updateBusinessWebsiteAction,
  previewProductImportAction,
  importProductsAction,
  deleteProductAction,
  createOfferingAction,
  updateOfferingAction,
  suggestOfferingProfileAction,
  setOfferingStatusAction,
  duplicateOfferingAction,
  retryWebsiteOnboardingAction,
  applyWebsiteOnboardingProfileAction,
} from "../actions";
import { EditableName } from "@cofounderai/module-discovery/components/tenancy/editable-name";
import { EditableText } from "@cofounderai/module-discovery/components/tenancy/editable-text";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { ProductImportWizard } from "@cofounderai/module-discovery/components/tenancy/product-import-wizard";
import { AutoPopulateProductsButton } from "@cofounderai/module-discovery/components/tenancy/auto-populate-products-button";
import { OfferingsTable, type OfferingRow } from "@cofounderai/module-discovery/components/offerings/offerings-table";
import { WebsiteOnboardingPanel } from "@cofounderai/module-discovery/components/website-onboarding/website-onboarding-panel";
import type { Product } from "@cofounderai/module-discovery/lib/tenancy/types";

async function loadOfferingRow(product: Product): Promise<OfferingRow> {
  const workspace = await getWorkspaceForProduct(product.id);
  const prospectCounts = workspace ? await getProspectCounts(workspace.id) : null;
  return { offering: product, prospectCount: prospectCounts?.total ?? 0 };
}

/**
 * The business's own editable profile (name/website/description) plus its product
 * list -- this used to live at the bare business URL, which is now the Discovery
 * "Dashboard" (a metrics + actionable-items page, see ../page.tsx). This page is what
 * the sidebar's new "Business" link under Discovery points to.
 */
export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const products = await listProducts(business.id);
  const rows = await Promise.all(products.map(loadOfferingRow));
  const websiteOnboardingRun = await getLatestWebsiteOnboardingRun(business.id);
  const websiteOnboardingPages = websiteOnboardingRun
    ? await listWebsiteOnboardingPages(websiteOnboardingRun.id)
    : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Breadcrumbs items={[{ label: "Business" }]} />
          <Link
            href={`/dashboard/businesses/${business.id}/usage`}
            className="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            AI usage
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <EditableName
            name={business.name}
            action={renameBusinessAction.bind(null, business.id)}
            headingClassName="text-xl font-semibold"
          />
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Globe className="size-3.5 shrink-0" aria-hidden="true" />
            <EditableText
              value={business.website}
              action={updateBusinessWebsiteAction.bind(null, business.id)}
              placeholder="Add this business's website"
              textClassName="text-sm text-muted-foreground"
            />
          </div>
          <div className="self-start">
            <AutoPopulateProductsButton
              businessId={business.id}
              disabled={!business.website}
              disabledReason="Add a website above first."
              importAction={importProductsAction.bind(null, business.id)}
            />
          </div>
          <EditableText
            value={business.description}
            action={updateBusinessDescriptionAction.bind(null, business.id)}
            placeholder="Add a description for this business"
            multiline
            textClassName="text-sm text-muted-foreground"
          />
        </div>
      </div>

      {websiteOnboardingRun ? (
        <WebsiteOnboardingPanel
          businessId={business.id}
          initialRun={websiteOnboardingRun}
          initialPages={websiteOnboardingPages}
          retryAction={retryWebsiteOnboardingAction.bind(null, business.id)}
          applyAction={applyWebsiteOnboardingProfileAction.bind(null, business.id)}
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex justify-end">
          <ProductImportWizard
            previewAction={previewProductImportAction.bind(null, business.id)}
            importAction={importProductsAction.bind(null, business.id)}
          />
        </div>
        <OfferingsTable
          businessId={business.id}
          rows={rows}
          createAction={createOfferingAction.bind(null, business.id)}
          updateAction={updateOfferingAction.bind(null, business.id)}
          suggestAction={suggestOfferingProfileAction.bind(null, business.id)}
          setStatusAction={setOfferingStatusAction.bind(null, business.id)}
          duplicateAction={duplicateOfferingAction.bind(null, business.id)}
          deleteAction={deleteProductAction.bind(null, business.id)}
        />
      </section>
    </main>
  );
}
