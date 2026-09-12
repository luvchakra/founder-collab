/**
 * COMPLY-P1-02.6 (United States -- Exemption Certificates): "resale/exemption certificate
 * tracking per customer/registration." A customer-presented document that justifies NOT
 * collecting sales tax on a sale -- the mirror image of `gst.tax_registrations` (this
 * business's OWN registration) and `gst.item_category_tax_classifications` (COMPLY-P1-02.5,
 * what a business sells): this is what a CUSTOMER has told the business about why a sale to
 * THEM shouldn't be taxed.
 */

export type ExemptionCertificateType = "resale" | "manufacturing" | "agricultural" | "government" | "exempt_organization" | "other";

export type ExemptionCertificateTypeCatalogEntry = {
  code: ExemptionCertificateType;
  name: string;
  description: string;
};

/** A closed, real-practice vocabulary -- verified via WebSearch 2026-09-12 (Numeral,
 * Bennett Thrasher, TaxConnex, and PCMethods all independently naming the same handful of
 * common US exemption-certificate categories: resale, manufacturing, agricultural,
 * government, and nonprofit/exempt-organization). Same "small closed vocabulary" shape
 * `lib/compliance/treatments.ts` and `lib/us-product-taxability/categories.ts` already
 * established. */
export const EXEMPTION_CERTIFICATE_TYPE_CATALOG: ExemptionCertificateTypeCatalogEntry[] = [
  {
    code: "resale",
    name: "Resale certificate",
    description: "The buyer will resell the purchased goods, so no sales tax is due on this purchase (tax is collected later, from the buyer's own end customer).",
  },
  {
    code: "manufacturing",
    name: "Manufacturing/industrial processing exemption",
    description: "The purchase is materials or equipment used directly in manufacturing or industrial processing.",
  },
  {
    code: "agricultural",
    name: "Agricultural exemption",
    description: "The purchase is used in farming or agricultural production (e.g. machinery, feed).",
  },
  {
    code: "government",
    name: "Government exemption",
    description: "The buyer is a federal, state, or local government entity purchasing directly.",
  },
  {
    code: "exempt_organization",
    name: "Exempt organization (nonprofit) certificate",
    description: "The buyer is a qualifying nonprofit or charitable organization (e.g. 501(c)(3)).",
  },
  {
    code: "other",
    name: "Other",
    description: "An exemption basis not covered by the categories above.",
  },
];

export function getExemptionCertificateType(code: string): ExemptionCertificateTypeCatalogEntry | undefined {
  return EXEMPTION_CERTIFICATE_TYPE_CATALOG.find((c) => c.code === code);
}

export function isExemptionCertificateTypeSupported(code: string): boolean {
  return getExemptionCertificateType(code) !== undefined;
}

export type ExemptionCertificateStatus = "active" | "revoked";

export type ExemptionCertificate = {
  id: string;
  businessId: string;
  partyId: string;
  country: string;
  /** A single US state code, or `null` for a certificate that isn't state-specific (a
   * federal exempt-organization determination, or a multi-jurisdiction certificate
   * recorded without breaking it out by state -- see the migration's own docstring for
   * this documented simplification). */
  jurisdiction: string | null;
  certificateType: ExemptionCertificateType;
  certificateNumber: string;
  issuedDate: string;
  /** `null` -- some certificate types (e.g. many states' own resale certificates) do not
   * expire on their own and remain valid until revoked. */
  expiresAt: string | null;
  status: ExemptionCertificateStatus;
  attachmentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
