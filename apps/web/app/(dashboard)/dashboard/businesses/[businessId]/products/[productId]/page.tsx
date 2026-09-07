import { notFound } from "next/navigation";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProductKnowledge } from "@cofounderai/module-discovery/lib/knowledge/queries";
import { AiActionForm } from "@cofounderai/module-discovery/components/ai/ai-action-form";
import { EditableText } from "@cofounderai/module-discovery/components/tenancy/editable-text";
import { KnowledgeSourceCard } from "@cofounderai/module-discovery/components/knowledge/knowledge-source-card";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { CollapsibleCard } from "@cofounderai/module-discovery/components/ui/collapsible-card";
import { ExpandableBox } from "@cofounderai/module-discovery/components/ui/expandable-box";
import {
  addFileSourceAction,
  addTextSourceAction,
  deleteSourceAction,
  generateProductProfileAction,
  updateProductDescriptionAction,
  updateSourceAction,
} from "./actions";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const sources = await listProductKnowledge(workspace.id);
  const profile = product.product_profile;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <EditableText
          value={product.description}
          action={updateProductDescriptionAction.bind(null, businessId, productId)}
          placeholder="Add a description for this product"
          multiline
          textClassName="text-sm text-muted-foreground"
        />
      </section>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Product profile</h2>
          <AiActionForm
            action={generateProductProfileAction.bind(null, businessId, productId)}
            buttonLabel="Regenerate"
            pendingText="Generating..."
            buttonProps={{ disabled: !product.website }}
          >
            <input type="hidden" name="force" value="true" />
          </AiActionForm>
        </div>

        {!product.website ? (
          <p className="text-sm text-muted-foreground">
            Add a website above first -- the profile is researched from it.
          </p>
        ) : !profile ? (
          <p className="text-sm text-muted-foreground">
            Not generated yet. Click &quot;Regenerate&quot; to have AI research the
            website.
          </p>
        ) : (
          <ExpandableBox collapsedHeight={240}>
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="font-medium">Category</dt>
              <dd className="text-muted-foreground">{profile.category}</dd>
            </div>
            <div>
              <dt className="font-medium">Problem</dt>
              <dd className="text-muted-foreground">{profile.problem}</dd>
            </div>
            <div>
              <dt className="font-medium">Solution</dt>
              <dd className="text-muted-foreground">{profile.solution}</dd>
            </div>
            {profile.features.length > 0 ? (
              <div>
                <dt className="font-medium">Features</dt>
                <dd className="text-muted-foreground">{profile.features.join(", ")}</dd>
              </div>
            ) : null}
            {profile.differentiators.length > 0 ? (
              <div>
                <dt className="font-medium">Differentiators</dt>
                <dd className="text-muted-foreground">
                  {profile.differentiators.join(", ")}
                </dd>
              </div>
            ) : null}
            {profile.target_industries.length > 0 ? (
              <div>
                <dt className="font-medium">Target industries</dt>
                <dd className="text-muted-foreground">
                  {profile.target_industries.join(", ")}
                </dd>
              </div>
            ) : null}
            {profile.target_roles.length > 0 ? (
              <div>
                <dt className="font-medium">Target roles</dt>
                <dd className="text-muted-foreground">
                  {profile.target_roles.join(", ")}
                </dd>
              </div>
            ) : null}
            {profile.use_cases.length > 0 ? (
              <div>
                <dt className="font-medium">Use cases</dt>
                <dd className="text-muted-foreground">{profile.use_cases.join(", ")}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-medium">Pricing</dt>
              <dd className="text-muted-foreground">
                {profile.pricing_summary ?? "Not mentioned in sources"}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Competitive positioning</dt>
              <dd className="text-muted-foreground">{profile.competitive_positioning}</dd>
            </div>
            <div>
              <dt className="font-medium">Confidence</dt>
              <dd className="text-muted-foreground">
                {Math.round(profile.confidence * 100)}%
              </dd>
            </div>
          </dl>
          </ExpandableBox>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Knowledge sources</h2>

        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sources.map((source) => (
              <KnowledgeSourceCard
                key={source.id}
                sourceName={source.source_name}
                sourceType={source.source_type}
                content={source.content}
                updateAction={updateSourceAction.bind(null, businessId, productId, source.id)}
                deleteAction={deleteSourceAction.bind(null, businessId, productId, source.id)}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <CollapsibleCard label="Add a file">
              <form
                action={addFileSourceAction.bind(null, businessId, productId, workspace.id)}
                className="flex flex-col gap-3"
              >
                <input
                  type="file"
                  name="file"
                  required
                  accept=".pdf,.doc,.docx,.txt,.md,image/*"
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
                />
                <p className="text-xs text-muted-foreground">
                  PDF and Word documents are read for AI context; images and other files are
                  attached for reference only.
                </p>
                <SubmitButton size="sm" className="self-start" pendingText="Uploading...">
                  Upload
                </SubmitButton>
              </form>
            </CollapsibleCard>
          </div>

          <div className="flex-1">
            <CollapsibleCard label="Add text">
              <form
                action={addTextSourceAction.bind(null, businessId, productId, workspace.id)}
                className="flex flex-col gap-3"
              >
                <Input name="sourceName" placeholder="Source name (optional)" />
                <Textarea
                  name="content"
                  placeholder="Paste or write anything about this product"
                  rows={4}
                  required
                />
                <SubmitButton size="sm" className="self-start" pendingText="Adding...">
                  Add
                </SubmitButton>
              </form>
            </CollapsibleCard>
          </div>
        </div>
      </section>
    </div>
  );
}
