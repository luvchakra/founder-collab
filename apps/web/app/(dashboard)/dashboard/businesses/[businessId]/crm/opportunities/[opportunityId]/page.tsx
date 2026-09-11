import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { getOpportunity, listStages } from "@cofounderai/module-crm/lib/opportunities/queries";
import { listOpportunityProducts } from "@cofounderai/module-crm/lib/opportunities/products";
import { getParty } from "@cofounderai/core/parties/queries";
import { listItemsForBusiness } from "@cofounderai/core/items/queries";
import { hasModule } from "@cofounderai/core/licensing/queries";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Package, Trash2 } from "lucide-react";
import { EditValueDialog } from "../edit-value-dialog";
import { updateOpportunityValueAction } from "../actions";
import { addOpportunityProductAction, removeOpportunityProductAction } from "./actions";

/**
 * CRM-04.4's Opportunity detail page -- the first per-opportunity page (List/Kanban
 * views only ever showed row/card summaries). Its reason to exist is the products
 * section below: "Opportunity can reference multiple Inventory products where Inventory
 * is licensed" needs somewhere to live, and a detail page is the natural place per
 * docs/design/claude-ui-design-rules.md rule 1 (a page's own primary content should
 * match what a user came here to do, not be crammed into the list view's row).
 * CRM-04.5 (Opportunity Contacts) is expected to add its own section here next.
 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; opportunityId: string }>;
}) {
  const { businessId, opportunityId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const opportunity = await getOpportunity(businessId, opportunityId);
  if (!opportunity) notFound();

  const [party, stages, products, inventoryLicensed] = await Promise.all([
    getParty(opportunity.party_id),
    listStages(businessId),
    listOpportunityProducts(businessId, opportunityId),
    hasModule(businessId, "inventory"),
  ]);
  const stage = stages.find((s) => s.id === opportunity.stage_id);

  // ADR-10 degraded mode: no Inventory license means no product catalog to pick from,
  // so items simply isn't fetched rather than fetching and then hiding a populated list.
  const items = inventoryLicensed ? await listItemsForBusiness(businessId) : [];
  const activeItems = items.filter((item) => item.status === "active");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <Link href={`/dashboard/businesses/${businessId}/crm/opportunities`} className="text-sm text-muted-foreground hover:underline">
          &larr; Back to opportunities
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              <Link href={`/dashboard/businesses/${businessId}/crm/customers/${opportunity.party_id}`} className="hover:underline">
                {party?.name ?? "Unknown contact"}
              </Link>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {opportunity.estimated_value ? inr.format(opportunity.estimated_value) : "No estimate"}
              {opportunity.expected_close_date ? ` -- close ${formatDate(opportunity.expected_close_date)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={opportunity.status === "won" ? "secondary" : opportunity.status === "lost" ? "destructive" : "outline"}>
              {stage?.name ?? opportunity.status}
            </Badge>
            <EditValueDialog opportunity={opportunity} action={(formData) => updateOpportunityValueAction(businessId, opportunity.id, formData)} />
          </div>
        </div>
      </div>

      {inventoryLicensed ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Products</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {products.length === 0 ? (
              <EmptyState icon={Package} message="No products linked to this opportunity yet." />
            ) : (
              <div className="flex flex-col divide-y">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.itemName}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.quantity ? `Qty ${product.quantity}` : "No quantity"} &middot; {inr.format(product.unitPrice)} each
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-medium">{product.lineValue ? inr.format(product.lineValue) : "--"}</span>
                      <form action={removeOpportunityProductAction.bind(null, businessId, opportunityId, product.id)}>
                        <SubmitButton variant="ghost" size="sm">
                          <Trash2 className="size-4" aria-hidden="true" />
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeItems.length > 0 ? (
              <form
                action={addOpportunityProductAction.bind(null, businessId, opportunityId)}
                className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
              >
                <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                  <label htmlFor="itemId" className="text-xs text-muted-foreground">
                    Product
                  </label>
                  <NativeSelect id="itemId" name="itemId" defaultValue="">
                    <option value="" disabled>
                      Select a product
                    </option>
                    {activeItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex w-24 flex-col gap-1.5">
                  <label htmlFor="quantity" className="text-xs text-muted-foreground">
                    Quantity
                  </label>
                  <Input id="quantity" name="quantity" type="number" min={0} step="0.01" />
                </div>
                <SubmitButton pendingText="Adding...">Add product</SubmitButton>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
