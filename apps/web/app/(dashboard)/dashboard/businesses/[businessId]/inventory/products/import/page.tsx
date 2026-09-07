import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { importProductsAction } from "./actions";

export default async function ImportProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const basePath = `/dashboard/businesses/${businessId}/inventory/products`;

  return (
    <div className="flex flex-col gap-4">
      <Link href={basePath} className="text-sm text-muted-foreground hover:underline">
        ← Back to products
      </Link>
      <h2 className="font-medium">Import products from CSV</h2>
      <p className="text-sm text-muted-foreground">
        Paste CSV with a header row. Required columns:{" "}
        <code className="rounded bg-muted px-1">sku, name</code>. Optional:{" "}
        <code className="rounded bg-muted px-1">
          brand, category, supplier, unit, hsn_code, tax_rate, cost_price, selling_price,
          reorder_point, reorder_quantity, barcode, description
        </code>
        . <code className="rounded bg-muted px-1">supplier</code> is matched by name against
        this business&apos;s existing suppliers.
      </p>
      <form action={importProductsAction.bind(null, businessId)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="csv">CSV</Label>
          <Textarea
            id="csv"
            name="csv"
            rows={6}
            required
            placeholder={"sku,name,brand,category,tax_rate\nSKU-1001,Wireless Mouse,Logitech,Electronics,18"}
          />
        </div>
        <SubmitButton size="sm" className="self-start" pendingText="Importing...">
          Import
        </SubmitButton>
      </form>
    </div>
  );
}
