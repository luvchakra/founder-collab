import { notFound } from "next/navigation";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getIcpProfile, listCloneableIcpSourcesForBusiness } from "@cofounderai/module-discovery/lib/icp/queries";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AiActionForm } from "@cofounderai/module-discovery/components/ai/ai-action-form";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { IcpField } from "@cofounderai/module-discovery/components/icp/icp-field";
import { CloneIcpButton } from "@cofounderai/module-discovery/components/icp/clone-icp-button";
import { AutoPopulateStepBanner } from "@cofounderai/module-discovery/components/tenancy/auto-populate-step-banner";
import { generateIcpAction, updateIcpAction, approveIcpAction, cloneIcpAction, autoPopulateIcpAction } from "./actions";

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

  const prospectsPath = `/dashboard/businesses/${businessId}/products/${productId}/prospects`;
  const autoPopulateBanner = (
    <AutoPopulateStepBanner
      step="icp"
      action={autoPopulateIcpAction.bind(null, businessId, productId)}
      nextPath={`${prospectsPath}?autopopulate=1`}
      runningLabel="Populating your ICP from the product profile..."
    />
  );

  if (!product.product_profile) {
    return (
      <div className="flex flex-col gap-3">
        {autoPopulateBanner}
        <p className="text-sm text-muted-foreground">
          Generate a product profile on the Overview tab before defining an ICP.
        </p>
      </div>
    );
  }

  const [icp, cloneSources] = await Promise.all([
    getIcpProfile(workspace.id),
    listCloneableIcpSourcesForBusiness(businessId, productId),
  ]);

  if (!icp) {
    return (
      <div className="flex flex-col gap-3">
        {autoPopulateBanner}
        <p className="text-sm text-muted-foreground">
          No ICP yet. Generate one from the approved product profile{cloneSources.length > 0 ? ", or clone one from another offering." : "."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <AiActionForm
            action={generateIcpAction.bind(null, businessId, productId)}
            buttonLabel="Generate ICP"
            pendingText="Generating..."
          />
          <CloneIcpButton sources={cloneSources} hasExistingIcp={false} cloneAction={cloneIcpAction.bind(null, businessId, productId)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {autoPopulateBanner}
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
        <div className="flex flex-wrap gap-2">
          <AiActionForm
            action={generateIcpAction.bind(null, businessId, productId)}
            buttonLabel="Regenerate"
            pendingText="Regenerating..."
            buttonProps={{ variant: "outline" }}
          >
            <input type="hidden" name="force" value="true" />
          </AiActionForm>
          <CloneIcpButton sources={cloneSources} hasExistingIcp cloneAction={cloneIcpAction.bind(null, businessId, productId)} />
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
        <IcpField label="Description" name="description" defaultValue={icp.description ?? ""} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <IcpField label="Industries" name="industries" defaultValue={toLines(icp.industries)} />
          <IcpField
            label="Company sizes"
            name="companySizes"
            defaultValue={toLines(icp.company_sizes)}
          />
          <IcpField
            label="Geographies"
            name="geographies"
            defaultValue={toLines(icp.geographies)}
          />
          <IcpField label="Roles" name="roles" defaultValue={toLines(icp.roles)} />
          <IcpField
            label="Pain points"
            name="painPoints"
            defaultValue={toLines(icp.pain_points)}
          />
          <IcpField
            label="Buying signals"
            name="buyingSignals"
            defaultValue={toLines(icp.buying_signals)}
          />
          <IcpField
            label="Exclusions"
            name="exclusions"
            defaultValue={toLines(icp.exclusions)}
          />
          <IcpField label="Revenue" name="revenue" defaultValue={toLines(icp.revenue)} />
          <IcpField
            label="Business model"
            name="businessModel"
            defaultValue={toLines(icp.business_model)}
          />
          <IcpField label="Technology" name="technology" defaultValue={toLines(icp.technology)} />
          <IcpField
            label="Growth stage"
            name="growthStage"
            defaultValue={toLines(icp.growth_stage)}
          />
          <IcpField
            label="Existing tools"
            name="existingTools"
            defaultValue={toLines(icp.existing_tools)}
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
