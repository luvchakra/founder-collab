/**
 * PLATFORM-P1-10.12 (Organization Details): the vendor-only details of an organization,
 * validated here first (for the message) and by platform.organization_profiles' CHECKs as the
 * backstop (migration 20261013110000). Pure, so the console form and tests share it.
 */

export const USER_BASE_SIZES = ["1-50", "51-200", "201-1000", "1001-5000", "5001-20000", "20000+"] as const;

export type OrganizationProfile = {
  description: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  companyName: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  industry: string | null;
  userBaseSize: (typeof USER_BASE_SIZES)[number] | null;
  country: string | null;
  website: string | null;
};

export const EMPTY_PROFILE: OrganizationProfile = {
  description: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  companyName: null,
  companyEmail: null,
  companyPhone: null,
  industry: null,
  userBaseSize: null,
  country: null,
  website: null,
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9 ()-]{6,24}$/;

type Input = Partial<Record<keyof OrganizationProfile, string | null | undefined>>;

/** Trims, empties to null, lowercases emails, uppercases the country; then checks. Returns the
 * clean profile or the first problem in words. */
export function validateOrganizationProfile(input: Input): { ok: true; profile: OrganizationProfile } | { ok: false; error: string } {
  const t = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return s === "" ? null : s;
  };
  const p: OrganizationProfile = {
    description: t(input.description),
    contactName: t(input.contactName),
    contactEmail: t(input.contactEmail)?.toLowerCase() ?? null,
    contactPhone: t(input.contactPhone),
    companyName: t(input.companyName),
    companyEmail: t(input.companyEmail)?.toLowerCase() ?? null,
    companyPhone: t(input.companyPhone),
    industry: t(input.industry),
    userBaseSize: t(input.userBaseSize) as OrganizationProfile["userBaseSize"],
    country: t(input.country)?.toUpperCase() ?? null,
    website: t(input.website),
  };
  const max = (v: string | null, n: number) => v !== null && v.length > n;
  if (max(p.description, 1000)) return { ok: false, error: "Keep the description to 1000 characters." };
  if (max(p.contactName, 120)) return { ok: false, error: "Keep the contact name to 120 characters." };
  if (max(p.companyName, 160)) return { ok: false, error: "Keep the company name to 160 characters." };
  if (max(p.industry, 80)) return { ok: false, error: "Keep the industry to 80 characters." };
  if (p.contactEmail && !EMAIL.test(p.contactEmail)) return { ok: false, error: "Enter a valid contact email." };
  if (p.companyEmail && !EMAIL.test(p.companyEmail)) return { ok: false, error: "Enter a valid company email." };
  if (p.contactPhone && !PHONE.test(p.contactPhone)) return { ok: false, error: "Enter a valid contact phone (digits, spaces, + ( ) -)." };
  if (p.companyPhone && !PHONE.test(p.companyPhone)) return { ok: false, error: "Enter a valid company phone (digits, spaces, + ( ) -)." };
  if (p.userBaseSize && !(USER_BASE_SIZES as readonly string[]).includes(p.userBaseSize)) return { ok: false, error: "Choose a user base size from the list." };
  if (p.country && !/^[A-Z]{2}$/.test(p.country)) return { ok: false, error: "Use a two-letter country code, e.g. IN." };
  if (p.website && !/^https?:\/\/\S+$/i.test(p.website)) return { ok: false, error: "The website starts with http:// or https://." };
  return { ok: true, profile: p };
}

/** The database's column names, for platform.save_organization_profile(). */
export function profileToRow(p: OrganizationProfile): Record<string, string | null> {
  return {
    description: p.description,
    contact_name: p.contactName,
    contact_email: p.contactEmail,
    contact_phone: p.contactPhone,
    company_name: p.companyName,
    company_email: p.companyEmail,
    company_phone: p.companyPhone,
    industry: p.industry,
    user_base_size: p.userBaseSize,
    country: p.country,
    website: p.website,
  };
}
