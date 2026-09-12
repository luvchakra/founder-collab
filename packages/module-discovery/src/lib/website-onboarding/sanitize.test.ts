import { describe, expect, it } from "vitest";
import { sanitizeWebsiteProfile } from "./sanitize";
import type { WebsiteBusinessProfile, WebsiteListField, WebsiteTextField } from "../ai/schemas";

function textField(overrides: Partial<WebsiteTextField> = {}): WebsiteTextField {
  return { status: "unknown", value: null, ...overrides };
}

function listField(overrides: Partial<WebsiteListField> = {}): WebsiteListField {
  return { status: "unknown", items: [], ...overrides };
}

function profile(overrides: Partial<WebsiteBusinessProfile> = {}): WebsiteBusinessProfile {
  return {
    business_name: textField(),
    description: textField(),
    products_or_services: listField(),
    offering_categories: listField(),
    industries_served: listField(),
    customer_types: listField(),
    geographies: listField(),
    value_propositions: listField(),
    use_cases: listField(),
    problems_solved: listField(),
    pricing_hints: listField(),
    case_studies: listField(),
    testimonials: listField(),
    customer_logos: listField(),
    technology_platform: listField(),
    faqs: listField(),
    contact_information: textField(),
    relevant_pages: listField(),
    ...overrides,
  };
}

describe("sanitizeWebsiteProfile", () => {
  it("forces a text field marked unknown to have a null value even if the model populated one", () => {
    const result = sanitizeWebsiteProfile(
      profile({ business_name: textField({ status: "unknown", value: "Acme Inc" }) }),
    );
    expect(result.business_name).toEqual({ status: "unknown", value: null });
  });

  it("forces a list field marked unknown to have empty items even if the model populated some", () => {
    const result = sanitizeWebsiteProfile(
      profile({ industries_served: listField({ status: "unknown", items: ["Finance"] }) }),
    );
    expect(result.industries_served).toEqual({ status: "unknown", items: [] });
  });

  it("downgrades a blank text value to unknown regardless of the reported status", () => {
    const result = sanitizeWebsiteProfile(
      profile({ description: textField({ status: "explicit", value: "   " }) }),
    );
    expect(result.description).toEqual({ status: "unknown", value: null });
  });

  it("keeps an explicit value with real content as-is, trimmed", () => {
    const result = sanitizeWebsiteProfile(
      profile({ business_name: textField({ status: "explicit", value: "  Acme Inc  " }) }),
    );
    expect(result.business_name).toEqual({ status: "explicit", value: "Acme Inc" });
  });

  it("trims items, drops blanks, and dedupes case-insensitively", () => {
    const result = sanitizeWebsiteProfile(
      profile({
        products_or_services: listField({
          status: "explicit",
          items: [" Managed IAM ", "managed iam", "", "  ", "IAM Training"],
        }),
      }),
    );
    expect(result.products_or_services).toEqual({
      status: "explicit",
      items: ["Managed IAM", "IAM Training"],
    });
  });

  it("downgrades a list field to unknown when nothing usable is left after cleanup", () => {
    const result = sanitizeWebsiteProfile(
      profile({ case_studies: listField({ status: "inferred", items: ["", "   "] }) }),
    );
    expect(result.case_studies).toEqual({ status: "unknown", items: [] });
  });

  it("leaves every other field genuinely untouched", () => {
    const input = profile({
      geographies: listField({ status: "explicit", items: ["India", "United States"] }),
    });
    const result = sanitizeWebsiteProfile(input);
    expect(result.geographies).toEqual({ status: "explicit", items: ["India", "United States"] });
  });
});
