import { ImageIcon } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { assetSignedUrls, listAssets, listCampaigns, listOfferingOptions } from "@cofounderai/module-discovery/lib/marketing/queries";
import { MAX_ASSET_BYTES } from "@cofounderai/module-discovery/lib/marketing/mutations";
import { ASSET_TYPES, ASSET_TYPE_LABEL } from "@cofounderai/module-discovery/lib/marketing/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { deleteAssetAction, uploadAssetAction } from "../actions";
import { marketingContext } from "../context";

function size(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * MKT-11 — Marketing assets (§14). Files are stored through the platform's one attachment
 * service (private bucket, signed links that expire); this page only adds marketing
 * metadata and associations. The file's type is checked against its extension on the
 * server before anything is stored.
 */
export default async function AssetsPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { businessId, canManage } = await marketingContext(businessSlug);
  const [assets, campaigns, offerings] = await Promise.all([
    listAssets(businessId),
    listCampaigns(businessId),
    listOfferingOptions(businessId),
  ]);
  const urls = await assetSignedUrls(assets);
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const offeringName = new Map(offerings.map((o) => [o.id, o.name]));

  return (
    <>
      <PageHeader
        title="Assets"
        description="Logos, images, decks and documents your campaigns and content use."
        actions={<ExportMenu exportId="marketing.assets" businessSlug={businessSlug} />}
      />

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
            <CardDescription>
              Images, PDFs, presentations, documents and short videos up to {Math.round(MAX_ASSET_BYTES / (1024 * 1024))} MB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={uploadAssetAction.bind(null, businessId)} submitLabel="Upload" pendingText="Uploading..." resetOnSuccess encType="multipart/form-data">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="File" htmlFor="file">
                  <Input id="file" name="file" type="file" required />
                </Field>
                <Field label="Name" htmlFor="asset-name" hint="Defaults to the file name.">
                  <Input id="asset-name" name="name" maxLength={300} />
                </Field>
                <Field label="Type" htmlFor="assetType">
                  <NativeSelect id="assetType" name="assetType" defaultValue="image">
                    {ASSET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ASSET_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Alt text" htmlFor="altText" hint="Describes an image for people who cannot see it.">
                  <Input id="altText" name="altText" maxLength={500} />
                </Field>
                <Field label="Campaign" htmlFor="asset-campaign">
                  <NativeSelect id="asset-campaign" name="campaignId" defaultValue="">
                    <option value="">None</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Offering" htmlFor="asset-offering">
                  <NativeSelect id="asset-offering" name="offeringId" defaultValue="">
                    <option value="">None</option>
                    {offerings.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Description" htmlFor="asset-description">
                <Input id="asset-description" name="description" maxLength={2000} />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      {assets.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState icon={ImageIcon} message="No assets yet." />
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => {
            const url = urls.get(a.id);
            const isImage = a.contentType?.startsWith("image/") ?? false;
            return (
              <li key={a.id} className="flex flex-col overflow-hidden rounded-xl border bg-card">
                <div className="flex aspect-video items-center justify-center bg-muted/40">
                  {isImage && url ? (
                    // Signed, short-lived URL to a private object; next/image would cache it.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={a.altText ?? ""} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {a.fileName.split(".").pop()}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ASSET_TYPE_LABEL[a.assetType]} · {size(a.sizeBytes)}
                    {a.campaignId ? ` · ${campaignName.get(a.campaignId) ?? "Campaign"}` : ""}
                    {a.offeringId ? ` · ${offeringName.get(a.offeringId) ?? "Offering"}` : ""}
                  </p>
                  {a.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p> : null}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                        Open
                      </a>
                    ) : (
                      <span />
                    )}
                    {canManage ? (
                      <ActionForm
                        action={deleteAssetAction.bind(null, businessId, a.id)}
                        inline
                        submitLabel="Delete"
                        variant="ghost"
                        confirm={`Delete ${a.name}? The file is removed.`}
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
