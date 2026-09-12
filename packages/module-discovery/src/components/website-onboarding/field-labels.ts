import type { WebsiteBusinessProfile } from "../../lib/ai/schemas";

type TextFieldKey = "business_name" | "description" | "contact_information";
type ListFieldKey = Exclude<keyof WebsiteBusinessProfile, TextFieldKey>;

/** Display order + labels for the profile review list -- kept separate from the schema
 * itself (lib/ai/schemas.ts) since this is presentation-only and the schema's own field
 * order already matches the doc's own literal list. */
export const WEBSITE_TEXT_FIELDS: { key: TextFieldKey; label: string }[] = [
  { key: "business_name", label: "Business name" },
  { key: "description", label: "Description" },
  { key: "contact_information", label: "Contact information" },
];

export const WEBSITE_LIST_FIELDS: { key: ListFieldKey; label: string }[] = [
  { key: "products_or_services", label: "Products / services" },
  { key: "offering_categories", label: "Offering categories" },
  { key: "industries_served", label: "Industries served" },
  { key: "customer_types", label: "Customer types" },
  { key: "geographies", label: "Geographies" },
  { key: "value_propositions", label: "Value propositions" },
  { key: "use_cases", label: "Use cases" },
  { key: "problems_solved", label: "Problems solved" },
  { key: "pricing_hints", label: "Pricing hints" },
  { key: "case_studies", label: "Case studies" },
  { key: "testimonials", label: "Testimonials" },
  { key: "customer_logos", label: "Customer logos" },
  { key: "technology_platform", label: "Technology / platform" },
  { key: "faqs", label: "FAQs" },
  { key: "relevant_pages", label: "Relevant pages found" },
];

export const WEBSITE_FIELD_STATUS_LABEL: Record<"explicit" | "inferred" | "unknown", string> = {
  explicit: "Stated on site",
  inferred: "AI interpretation",
  unknown: "Not found",
};
