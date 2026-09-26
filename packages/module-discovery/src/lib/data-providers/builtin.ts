import type { ContactVerification, ContactVerificationInput, DataProviderAdapter, DetectedTechnology, TechnologyLookup } from "./contracts";

/**
 * DISC-OFFER-P1-03.3: the adapter Discovery runs on when no external data provider is
 * configured. Deterministic and offline (CLAUDE.md dev principle 4) -- it only ever
 * reports what can be established from data already in hand, and says so:
 *
 *   - contact verification: address syntax, shared/role mailboxes, personal mailbox
 *     providers, and whether the address belongs to the company's own domain. It never
 *     claims `deliverable` -- that needs a mailbox check this adapter cannot make.
 *   - technology detection: named technologies mentioned in the research text Discovery
 *     already holds, each returned with the sentence it was found in.
 *
 * Company/person enrichment and signals are produced by AI research (the AI Router), not
 * by this adapter, so it reports them `not_supported`.
 */

const EMAIL_RE = /^[^\s@]+@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)$/i;

const ROLE_MAILBOXES = new Set([
  "admin", "contact", "enquiries", "enquiry", "hello", "help", "hr", "info", "jobs", "careers",
  "marketing", "noreply", "no-reply", "office", "sales", "support", "team", "billing", "accounts",
]);

const PERSONAL_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "outlook.com", "hotmail.com",
  "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com",
  "gmx.de", "yandex.com", "rediffmail.com", "mail.com",
]);

function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
  return host || null;
}

/** An address on the company's own domain or one of its subdomains. */
function belongsToDomain(emailDomain: string, companyDomain: string): boolean {
  return emailDomain === companyDomain || emailDomain.endsWith(`.${companyDomain}`);
}

export function verifyContactOffline(input: ContactVerificationInput): ContactVerification {
  const email = input.email.trim();
  const match = EMAIL_RE.exec(email);
  if (!match) return { status: "undeliverable", reason: "Not a valid email address." };

  const local = email.slice(0, email.lastIndexOf("@")).toLowerCase();
  const emailDomain = match[1]!.toLowerCase();
  const companyDomain = normalizeDomain(input.companyDomain);

  if (ROLE_MAILBOXES.has(local)) return { status: "risky", reason: "Shared mailbox, not a person's own address." };
  if (PERSONAL_MAIL_DOMAINS.has(emailDomain)) {
    return { status: "risky", reason: "Personal mailbox, not a company address." };
  }
  if (companyDomain && !belongsToDomain(emailDomain, companyDomain)) {
    return { status: "risky", reason: `Address is not on the company's domain (${companyDomain}).` };
  }
  return {
    status: "unverified",
    reason: companyDomain ? "Well-formed address on the company's domain; delivery not tested." : "Well-formed address; delivery not tested.",
  };
}

/** A small catalogue of widely used products, matched as whole words. Kept deliberately
 * to names that are unambiguous in business text ("Go", "Oracle" the company, etc. are
 * left out) -- a false detection is worse than a missed one. */
const TECHNOLOGY_CATALOG: { name: string; category: string; pattern: RegExp }[] = [
  { name: "Salesforce", category: "CRM", pattern: /\bsalesforce\b/i },
  { name: "HubSpot", category: "CRM", pattern: /\bhubspot\b/i },
  { name: "Zoho CRM", category: "CRM", pattern: /\bzoho crm\b/i },
  { name: "SAP", category: "ERP", pattern: /\bSAP\b/ },
  { name: "NetSuite", category: "ERP", pattern: /\bnetsuite\b/i },
  { name: "Microsoft Dynamics", category: "ERP", pattern: /\b(?:microsoft )?dynamics 365\b/i },
  { name: "Workday", category: "HR", pattern: /\bworkday\b/i },
  { name: "AWS", category: "Cloud", pattern: /\b(?:AWS|amazon web services)\b/ },
  { name: "Microsoft Azure", category: "Cloud", pattern: /\bazure\b(?!\s+(?:ad|active directory)\b)/i },
  { name: "Google Cloud", category: "Cloud", pattern: /\b(?:google cloud|GCP)\b/ },
  { name: "Kubernetes", category: "Infrastructure", pattern: /\bkubernetes\b/i },
  { name: "Snowflake", category: "Data", pattern: /\bsnowflake\b/i },
  { name: "Databricks", category: "Data", pattern: /\bdatabricks\b/i },
  { name: "Okta", category: "Identity", pattern: /\bokta\b/i },
  { name: "Microsoft Entra ID", category: "Identity", pattern: /\b(?:entra id|azure ad|azure active directory)\b/i },
  { name: "Active Directory", category: "Identity", pattern: /\bactive directory\b/i },
  { name: "Ping Identity", category: "Identity", pattern: /\bping identity\b/i },
  { name: "CyberArk", category: "Identity", pattern: /\bcyberark\b/i },
  { name: "SailPoint", category: "Identity", pattern: /\bsailpoint\b/i },
  { name: "CrowdStrike", category: "Security", pattern: /\bcrowdstrike\b/i },
  { name: "Palo Alto Networks", category: "Security", pattern: /\bpalo alto networks\b/i },
  { name: "Zscaler", category: "Security", pattern: /\bzscaler\b/i },
  { name: "Splunk", category: "Security", pattern: /\bsplunk\b/i },
  { name: "ServiceNow", category: "IT service management", pattern: /\bservicenow\b/i },
  { name: "Jira", category: "Collaboration", pattern: /\bjira\b/i },
  { name: "Slack", category: "Collaboration", pattern: /\bslack\b/i },
  { name: "Microsoft 365", category: "Productivity", pattern: /\b(?:microsoft 365|office 365|M365)\b/i },
  { name: "Google Workspace", category: "Productivity", pattern: /\bgoogle workspace\b/i },
  { name: "Shopify", category: "E-commerce", pattern: /\bshopify\b/i },
  { name: "Magento", category: "E-commerce", pattern: /\bmagento\b/i },
  { name: "WordPress", category: "Website", pattern: /\bwordpress\b/i },
  { name: "Stripe", category: "Payments", pattern: /\bstripe\b/i },
  { name: "Razorpay", category: "Payments", pattern: /\brazorpay\b/i },
  { name: "Tally", category: "Accounting", pattern: /\btally(?:prime| erp)\b/i },
  { name: "QuickBooks", category: "Accounting", pattern: /\bquickbooks\b/i },
  { name: "Xero", category: "Accounting", pattern: /\bxero\b/i },
];

const EVIDENCE_MAX_CHARS = 200;

function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf(".", index) + 1, 0);
  const endDot = text.indexOf(".", index);
  const end = endDot === -1 ? text.length : endDot + 1;
  const sentence = text.slice(start, end).trim();
  return sentence.length > EVIDENCE_MAX_CHARS ? `${sentence.slice(0, EVIDENCE_MAX_CHARS - 1).trimEnd()}…` : sentence;
}

export function detectTechnologiesInText(input: TechnologyLookup): DetectedTechnology[] {
  const texts = (input.evidenceText ?? []).map((t) => t.trim()).filter(Boolean);
  const found: DetectedTechnology[] = [];
  for (const tech of TECHNOLOGY_CATALOG) {
    for (const text of texts) {
      const match = tech.pattern.exec(text);
      if (match) {
        found.push({ name: tech.name, category: tech.category, evidence: sentenceAround(text, match.index) });
        break;
      }
    }
  }
  return found;
}

export const builtinDataProvider: DataProviderAdapter = {
  key: "builtin",
  label: "WonderArk (offline checks)",
  sandbox: false,
  capabilities: {
    contact_verification: async (input) => verifyContactOffline(input),
    technology_detection: async (input) => detectTechnologiesInText(input),
  },
};
