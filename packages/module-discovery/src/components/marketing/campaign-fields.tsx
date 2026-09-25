import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_OBJECTIVE_LABEL,
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABEL,
  type MarketingCampaign,
} from "../../lib/marketing/types";
import { Field, FormStep } from "./field";

const date = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");

/**
 * MKT-05 — the campaign form, laid out as the five steps of the create flow (§9.3) on one
 * page: a founder can see the whole campaign before saving, and a phone scrolls through
 * the steps instead of paging. Saving always produces a draft; the status is not a field.
 */
export function CampaignFields({
  campaign,
  offerings,
}: {
  campaign?: MarketingCampaign | null;
  offerings: { id: string; name: string }[];
}) {
  const c = campaign ?? null;
  return (
    <>
      <FormStep step={1} title="Name and objective">
        <Field label="Campaign name" htmlFor="name">
          <Input id="name" name="name" required maxLength={200} defaultValue={c?.name ?? ""} placeholder="Smart Home Awareness" />
        </Field>
        <Field label="Objective" htmlFor="objective">
          <NativeSelect id="objective" name="objective" required defaultValue={c?.objective ?? ""}>
            <option value="" disabled>
              Choose an objective
            </option>
            {CAMPAIGN_OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {CAMPAIGN_OBJECTIVE_LABEL[o]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Description" htmlFor="description">
          <Textarea id="description" name="description" rows={3} maxLength={4000} defaultValue={c?.description ?? ""} />
        </Field>
      </FormStep>

      <FormStep step={2} title="Offering and audience">
        <Field label="Offering" htmlFor="offeringId" hint="Leave blank for a company-wide campaign.">
          <NativeSelect id="offeringId" name="offeringId" defaultValue={c?.offeringId ?? ""}>
            <option value="">Company-wide</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FormStep>

      <FormStep step={3} title="Channel, message and landing page">
        <Field label="Channel" htmlFor="channel">
          <NativeSelect id="channel" name="channel" required defaultValue={c?.channel ?? ""}>
            <option value="" disabled>
              Choose a channel
            </option>
            {MARKETING_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {MARKETING_CHANNEL_LABEL[ch]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Message" htmlFor="message">
          <Textarea id="message" name="message" rows={3} maxLength={4000} defaultValue={c?.message ?? ""} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Call to action" htmlFor="cta">
            <Input id="cta" name="cta" maxLength={300} defaultValue={c?.cta ?? ""} placeholder="Book a site survey" />
          </Field>
          <Field label="Landing page" htmlFor="landingPageUrl">
            <Input id="landingPageUrl" name="landingPageUrl" type="url" defaultValue={c?.landingPageUrl ?? ""} placeholder="https://" />
          </Field>
        </div>
      </FormStep>

      <FormStep step={4} title="Budget, dates and tracking">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Budget" htmlFor="budget" hint="Optional. Leave blank if there is no budget.">
            <Input id="budget" name="budget" inputMode="decimal" defaultValue={c?.budget ?? ""} />
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Input id="currency" name="currency" maxLength={3} defaultValue={c?.currency ?? "INR"} className="uppercase" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="startAt">
            <Input id="startAt" name="startAt" type="date" defaultValue={date(c?.startAt)} />
          </Field>
          <Field label="End date" htmlFor="endAt">
            <Input id="endAt" name="endAt" type="date" defaultValue={date(c?.endAt)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="UTM source" htmlFor="utmSource">
            <Input id="utmSource" name="utmSource" defaultValue={c?.utm.source ?? ""} />
          </Field>
          <Field label="UTM medium" htmlFor="utmMedium">
            <Input id="utmMedium" name="utmMedium" defaultValue={c?.utm.medium ?? ""} />
          </Field>
          <Field label="UTM campaign" htmlFor="utmCampaign">
            <Input id="utmCampaign" name="utmCampaign" defaultValue={c?.utm.campaign ?? ""} />
          </Field>
        </div>
      </FormStep>

      <FormStep step={5} title="Notes and review">
        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" rows={3} maxLength={4000} defaultValue={c?.notes ?? ""} />
        </Field>
        <p className="text-sm text-muted-foreground">
          {c ? "Saving keeps the campaign's current status." : "The campaign is saved as a Draft. Plan or activate it from its page when it is ready."}
        </p>
      </FormStep>
    </>
  );
}
