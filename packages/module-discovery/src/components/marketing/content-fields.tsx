import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { CONTENT_TYPES, CONTENT_TYPE_LABEL, type MarketingContent } from "../../lib/marketing/types";
import { Field } from "./field";

/**
 * MKT-08 — the content editor's fields (§12.4, §12.5). Every save is a new version; the
 * status is not a field — it changes only through the explicit actions beside the editor.
 */
export function ContentFields({
  content,
  offerings,
  campaigns,
  defaultCampaignId,
}: {
  content?: MarketingContent | null;
  offerings: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
  defaultCampaignId?: string | null;
}) {
  const c = content ?? null;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" required maxLength={300} defaultValue={c?.title ?? ""} />
        </Field>
        <Field label="Type" htmlFor="contentType">
          <NativeSelect id="contentType" name="contentType" required defaultValue={c?.contentType ?? "blog"}>
            {CONTENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTENT_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Offering" htmlFor="offeringId">
          <NativeSelect id="offeringId" name="offeringId" defaultValue={c?.offeringId ?? ""}>
            <option value="">Company-wide</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Campaign" htmlFor="campaignId">
          <NativeSelect id="campaignId" name="campaignId" defaultValue={c?.campaignId ?? defaultCampaignId ?? ""}>
            <option value="">None</option>
            {campaigns.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Audience" htmlFor="audience">
          <Input id="audience" name="audience" maxLength={500} defaultValue={c?.audience ?? ""} />
        </Field>
        <Field label="Channel" htmlFor="channel">
          <Input id="channel" name="channel" maxLength={100} defaultValue={c?.channel ?? ""} placeholder="LinkedIn, newsletter, blog..." />
        </Field>
      </div>
      <Field label="Brief" htmlFor="brief" hint="What this piece should achieve and the points it must make.">
        <Textarea id="brief" name="brief" rows={3} maxLength={4000} defaultValue={c?.brief ?? ""} />
      </Field>
      <Field label="Body" htmlFor="body">
        <Textarea id="body" name="body" rows={14} maxLength={100000} defaultValue={c?.body ?? ""} className="font-mono text-sm" />
      </Field>
      <Field label="Summary" htmlFor="summary">
        <Textarea id="summary" name="summary" rows={2} maxLength={2000} defaultValue={c?.summary ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Call to action" htmlFor="cta">
          <Input id="cta" name="cta" maxLength={300} defaultValue={c?.cta ?? ""} />
        </Field>
        <Field label="SEO title" htmlFor="seoTitle">
          <Input id="seoTitle" name="seoTitle" maxLength={300} defaultValue={c?.seoMetadata.title ?? ""} />
        </Field>
        <Field label="Meta description" htmlFor="seoDescription">
          <Input id="seoDescription" name="seoDescription" maxLength={500} defaultValue={c?.seoMetadata.description ?? ""} />
        </Field>
      </div>
    </>
  );
}
