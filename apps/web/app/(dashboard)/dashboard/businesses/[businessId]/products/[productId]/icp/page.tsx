import { notFound } from "next/navigation";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AiActionForm } from "@cofounderai/module-discovery/components/ai/ai-action-form";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { generateIcpAction, updateIcpAction, approveIcpAction } from "./actions";

function toLines(items: string[]) {
  return items.join("\n");
}

export default async function IcpPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  if (!product.product_profile) {
    return (
      <p className="text-sm text-muted-foreground">
        Generate a product profile on the Overview tab before defining an ICP.
      </p>
    );
  }

  const icp = await getIcpProfile(workspace.id);

  if (!icp) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          No ICP yet. Generate one from the approved product profile.
        </p>
        <AiActionForm
          action={generateIcpAction.bind(null, businessId, productId)}
          buttonLabel="Generate ICP"
          pendingText="Generating..."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span
          className={
            icp.status === "approved"
              ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          }
        >
          {icp.status === "approved" ? "Approved" : "Draft"}
        </span>
        <div className="flex gap-2">
          <AiActionForm
            action={generateIcpAction.bind(null, businessId, productId)}
            buttonLabel="Regenerate"
            pendingText="Regenerating..."
            buttonProps={{ variant: "outline" }}
          >
            <input type="hidden" name="force" value="true" />
          </AiActionForm>
          {icp.status === "draft" ? (
            <form action={approveIcpAction.bind(null, businessId, productId, icp.id)}>
              <SubmitButton size="sm" pendingText="Approving...">
                Approve
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      <form
        action={updateIcpAction.bind(null, businessId, productId, icp.id)}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={icp.name} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={icp.description ?? ""}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ListField label="Industries" name="industries" defaultValue={icp.industries} />
          <ListField
            label="Company sizes"
            name="companySizes"
            defaultValue={icp.company_sizes}
          />
          <ListField
            label="Geographies"
            name="geographies"
            defaultValue={icp.geographies}
          />
          <ListField label="Roles" name="roles" defaultValue={icp.roles} />
          <ListField
            label="Pain points"
            name="painPoints"
            defaultValue={icp.pain_points}
          />
          <ListField
            label="Buying signals"
            name="buyingSignals"
            defaultValue={icp.buying_signals}
          />
          <ListField
            label="Exclusions"
            name="exclusions"
            defaultValue={icp.exclusions}
          />
        </div>
        <p className="text-xs text-muted-foreground">One item per line.</p>
        <SubmitButton size="sm" className="self-start" pendingText="Saving...">
          Save changes
        </SubmitButton>
      </form>
    </div>
  );
}

function ListField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} rows={2} defaultValue={toLines(defaultValue)} />
    </div>
  );
}
