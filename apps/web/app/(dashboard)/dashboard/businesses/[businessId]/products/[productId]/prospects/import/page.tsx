import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { importProspectsAction } from "./actions";

export default async function ImportProspectsPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const basePath = `/dashboard/businesses/${businessId}/products/${productId}/prospects`;

  return (
    <div className="flex flex-col gap-4">
      <Link href={basePath} className="text-sm text-muted-foreground hover:underline">
        ← Back to prospects
      </Link>
      <h2 className="font-medium">Import prospects from CSV</h2>
      <p className="text-sm text-muted-foreground">
        Paste CSV with a header row. Required column:{" "}
        <code className="rounded bg-muted px-1">company_name</code>. Optional:{" "}
        <code className="rounded bg-muted px-1">
          website, industry, company_size, location, description
        </code>
        .
      </p>
      <form
        action={importProspectsAction.bind(null, businessId, productId, workspace.id)}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="csv">CSV</Label>
          <Textarea
            id="csv"
            name="csv"
            rows={4}
            required
            placeholder={"company_name,website,industry\nAcme Inc,https://acme.com,Banking"}
          />
        </div>
        <SubmitButton size="sm" className="self-start" pendingText="Importing...">
          Import
        </SubmitButton>
      </form>
    </div>
  );
}
