import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
import {
  getBusiness,
  getWorkspaceForProduct,
  listProducts,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { getProspectCounts } from "@cofounderai/module-discovery/lib/prospects/queries";
import { createProductAction } from "@/app/(dashboard)/dashboard/actions";
import {
  renameBusinessAction,
  updateBusinessDescriptionAction,
  previewProductImportAction,
  importProductsAction,
} from "./actions";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { EditableName } from "@cofounderai/module-discovery/components/tenancy/editable-name";
import { EditableText } from "@cofounderai/module-discovery/components/tenancy/editable-text";
import { Breadcrumbs } from "@cofounderai/module-discovery/components/tenancy/breadcrumbs";
import { ProductImportWizard } from "@cofounderai/module-discovery/components/tenancy/product-import-wizard";
import { cn } from "@cofounderai/core/lib/utils";
import type { Product } from "@cofounderai/module-discovery/lib/tenancy/types";

type ProductCardData = {
  product: Product;
  hasProfile: boolean;
  hasIcp: boolean;
  prospectCount: number;
};

async function loadProductCardData(product: Product): Promise<ProductCardData> {
  const workspace = await getWorkspaceForProduct(product.id);
  const [icp, prospectCounts] = workspace
    ? await Promise.all([getIcpProfile(workspace.id), getProspectCounts(workspace.id)])
    : [null, null];

  return {
    product,
    hasProfile: Boolean(product.product_profile),
    hasIcp: Boolean(icp),
    prospectCount: prospectCounts?.total ?? 0,
  };
}

function StatusChip({ done, doneLabel, todoLabel }: { done: boolean; doneLabel: string; todoLabel: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}
    >
      {done ? doneLabel : todoLabel}
    </span>
  );
}

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const products = await listProducts(business.id);
  const cards = await Promise.all(products.map(loadProductCardData));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8">
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
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Business
        </span>
        <EditableName
          name={business.name}
          action={renameBusinessAction.bind(null, business.id)}
          headingClassName="text-xl font-semibold"
        />
        <EditableText
          value={business.description}
          action={updateBusinessDescriptionAction.bind(null, business.id)}
          placeholder="Add a description for this business"
          multiline
          textClassName="text-sm text-muted-foreground"
        />
      </div>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Products</h2>
          <ProductImportWizard
            previewAction={previewProductImportAction.bind(null, business.id)}
            importAction={importProductsAction.bind(null, business.id)}
          />
        </div>
        {cards.length === 0 ? (
          <p className="mt-2 text-muted-foreground">
            Create a product to get its own GTM workspace.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map(({ product, hasProfile, hasIcp, prospectCount }) => (
              <li key={product.id}>
                <Link
                  href={`/dashboard/businesses/${business.id}/products/${product.id}`}
                  className="group flex h-full flex-col gap-3 rounded-lg border p-4 transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium">{product.name}</h3>
                    <ChevronRight
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </div>
                  {product.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {product.description}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                    <StatusChip done={hasProfile} doneLabel="Profile ready" todoLabel="No profile" />
                    <StatusChip done={hasIcp} doneLabel="ICP defined" todoLabel="No ICP" />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {prospectCount} prospect{prospectCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <h2 className="font-medium">Create a product</h2>
        <form
          action={createProductAction.bind(null, business.id)}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="website">Website</Label>
            <Input id="website" name="website" type="text" placeholder="https://" />
          </div>
          <SubmitButton pendingText="Creating...">Create product</SubmitButton>
        </form>
      </section>
    </main>
  );
}
