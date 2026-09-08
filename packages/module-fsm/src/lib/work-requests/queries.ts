import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { createAdminClient as createFsmAdminClient } from "../../db/admin";
import type { ContactFormBusiness } from "./types";

/** Resolves `/p/request/[businessSlug]`'s own business, entirely via the service-role
 * client -- there's no session on a public contact-form page. Returns `null` for a
 * missing slug, an unlicensed business, or one that hasn't turned the form on
 * (`fsm.settings.contact_form_enabled`, default false, no settings row yet since F-15
 * hasn't landed) -- the page shows the same "not available" copy for all three rather
 * than leaking which one it was. */
export async function resolveContactFormBusiness(businessSlug: string): Promise<ContactFormBusiness | null> {
  const core = createCoreAdminClient({ schema: "core" });
  const { data: settings } = await core.from("business_settings").select("business_id").eq("slug", businessSlug).maybeSingle();
  if (!settings) return null;

  const { data: licensed } = await core.rpc("has_module", { p_business_id: settings.business_id, p_key: "fsm" });
  if (!licensed) return null;

  const fsm = createFsmAdminClient();
  const { data: fsmSettings } = await fsm.from("settings").select("contact_form_enabled").eq("business_id", settings.business_id).maybeSingle();
  if (!fsmSettings?.contact_form_enabled) return null;

  const { data: business } = await core.from("businesses").select("name").eq("id", settings.business_id).maybeSingle();
  if (!business) return null;

  return { businessId: settings.business_id, businessName: business.name };
}
