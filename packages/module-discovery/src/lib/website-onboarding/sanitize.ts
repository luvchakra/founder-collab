import {
  type WebsiteBusinessProfile,
  type WebsiteListField,
  type WebsiteTextField,
} from "../ai/schemas";

/**
 * Structural enforcement of "AI never invents missing information," the same discipline
 * `matchBuyingCommittee()`/`detectNegativeSignals()` etc. already apply elsewhere in this
 * module: the prompt already asks for this, but a prompt is a request, not a guarantee --
 * this function is what actually makes it true regardless of what the model returns.
 * Pure and deterministic (CLAUDE.md dev principle #4).
 *
 * - A field marked "unknown" always comes out with an empty value (null / []), even if
 *   the model populated one anyway.
 * - A text field with a blank/whitespace-only value is treated as "unknown" (nothing was
 *   really said).
 * - A list field's items are trimmed, empty entries dropped, and exact-duplicate entries
 *   (case-insensitive) collapsed to their first occurrence -- and if that leaves nothing,
 *   the field is downgraded to "unknown" rather than reporting a status with zero
 *   evidence behind it.
 */
export function sanitizeWebsiteProfile(profile: WebsiteBusinessProfile): WebsiteBusinessProfile {
  return {
    business_name: sanitizeTextField(profile.business_name),
    description: sanitizeTextField(profile.description),
    products_or_services: sanitizeListField(profile.products_or_services),
    offering_categories: sanitizeListField(profile.offering_categories),
    industries_served: sanitizeListField(profile.industries_served),
    customer_types: sanitizeListField(profile.customer_types),
    geographies: sanitizeListField(profile.geographies),
    value_propositions: sanitizeListField(profile.value_propositions),
    use_cases: sanitizeListField(profile.use_cases),
    problems_solved: sanitizeListField(profile.problems_solved),
    pricing_hints: sanitizeListField(profile.pricing_hints),
    case_studies: sanitizeListField(profile.case_studies),
    testimonials: sanitizeListField(profile.testimonials),
    customer_logos: sanitizeListField(profile.customer_logos),
    technology_platform: sanitizeListField(profile.technology_platform),
    faqs: sanitizeListField(profile.faqs),
    contact_information: sanitizeTextField(profile.contact_information),
    relevant_pages: sanitizeListField(profile.relevant_pages),
  };
}

function sanitizeTextField(field: WebsiteTextField): WebsiteTextField {
  const value = field.value?.trim() || null;
  if (!value || field.status === "unknown") {
    return { status: "unknown", value: null };
  }
  return { status: field.status, value };
}

function sanitizeListField(field: WebsiteListField): WebsiteListField {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of field.items) {
    const item = raw.trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  if (items.length === 0 || field.status === "unknown") {
    return { status: "unknown", items: [] };
  }
  return { status: field.status, items };
}
