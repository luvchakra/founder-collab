import type { HelpGuide } from "./types";

/**
 * The questions people actually arrive with, answered in a couple of sentences and then
 * pointed at the section that covers them properly.
 *
 * Hand-written rather than generated: a FAQ is not a summary of the documentation, it is
 * the set of things the documentation's structure makes hard to find. Every entry has to
 * point at a real section -- `faq.test.ts` fails the build if one doesn't, so a renamed
 * heading can't quietly leave a dead answer behind.
 */

export type FaqCategory =
  | "Account & access"
  | "Businesses & modules"
  | "Billing & AI"
  | "Day to day"
  | "For administrators";

export type FaqEntry = {
  question: string;
  answer: string;
  guideSlug: HelpGuide["slug"];
  sectionId: string;
  category: FaqCategory;
};

export const FAQ: FaqEntry[] = [
  {
    category: "Account & access",
    question: "I forgot my password. How do I get back in?",
    answer:
      "Use the \"Forgot password?\" link next to the password box on the login page. You'll get an email with a link to set a new one. If the link says it's invalid or expired, request a fresh one — a reset link is single-use, and it has to be opened in the same browser that asked for it unless your deployment uses the token-based email template.",
    guideSlug: "getting-started",
    sectionId: "creating-an-account",
  },
  {
    category: "Account & access",
    question: "Why can't I see the \"Continue with Google\" button?",
    answer:
      "Because this deployment's Supabase project doesn't have Google sign-in switched on. The button is hidden rather than shown-and-broken. Whoever operates the deployment can enable it with a Google Cloud OAuth client and the provider toggle in Supabase — no redeploy needed, the button appears within a few minutes of it being turned on.",
    guideSlug: "getting-started",
    sectionId: "enabling-google-sign-in-for-whoever-deploys-wonderark",
  },
  {
    category: "Account & access",
    question: "Can I see what I'm typing in the password box?",
    answer:
      "Yes — the eye icon at the right-hand end of any password box reveals what you've typed, and hides it again. It always starts hidden, on every page and every visit.",
    guideSlug: "getting-started",
    sectionId: "creating-an-account",
  },
  {
    category: "Account & access",
    question: "Someone on my team can't see a page I can see. Why?",
    answer:
      "Two things gate every page: whether the business has that module licensed, and whether the person's role carries the permission. An unlicensed module's pages don't appear at all. Check the member's role under the business's Team & Permissions screen.",
    guideSlug: "getting-started",
    sectionId: "team-permissions",
  },
  {
    category: "Businesses & modules",
    question: "What's the difference between a business and an offering?",
    answer:
      "A business is the company — one inventory, one tax registration, one crew, one customer ledger. An offering is a product or service line you market, and only Discovery works per-offering. Most modules are per-business; Discovery is the exception.",
    guideSlug: "getting-started",
    sectionId: "businesses-offerings-and-why-there-are-two-concepts",
  },
  {
    category: "Businesses & modules",
    question: "How do I switch between businesses?",
    answer:
      "Use the business switcher in the top bar. It shows each business's own logo, or a generic icon for one that hasn't set one. The module rail and everything in it reloads for the business you pick.",
    guideSlug: "getting-started",
    sectionId: "switching-between-businesses-and-modules",
  },
  {
    category: "Businesses & modules",
    question: "How do I turn a module on or off for a business?",
    answer:
      "Activate a module from the business's Licenses screen. Cancelling one never deletes data: you get 30 days of read-only grace, after which access stops but every row is kept. Reactivating restores everything, including events that were parked while it was off.",
    guideSlug: "getting-started",
    sectionId: "licensing-a-module",
  },
  {
    category: "Businesses & modules",
    question: "Do I have to license every module for the platform to work?",
    answer:
      "No. Nothing hard-depends on anything else. A feature that would normally show another module's data just leaves that section out when it isn't licensed, rather than failing. Finance works with hand-entered bills whether or not Inventory or Service is on.",
    guideSlug: "finance",
    sectionId: "working-without-the-other-modules",
  },
  {
    category: "Billing & AI",
    question: "Do I need my own AI API key?",
    answer:
      "Only if you want your AI usage billed to your own provider account. Otherwise the platform's included credit is used automatically. Connect your own key from Settings → Billing if you'd rather use it; your own key always wins when one is connected.",
    guideSlug: "discovery",
    sectionId: "connecting-an-ai-provider",
  },
  {
    category: "Billing & AI",
    question: "Where do I see what AI has cost me?",
    answer:
      "Settings → Usage breaks down AI runs and credit consumption. Repeatable AI operations are cached, so asking for the same thing twice doesn't bill twice.",
    guideSlug: "getting-started",
    sectionId: "billing-and-ai-credits",
  },
  {
    category: "Day to day",
    question: "My balance sheet doesn't balance. What's wrong?",
    answer:
      "Almost always a missing line rather than a broken ledger: until the year is closed, the period's own profit hasn't moved into retained earnings. WonderArk shows it as its own equity line for exactly this reason — check you're reading that line, and check the trial balance agrees.",
    guideSlug: "finance",
    sectionId: "financial-reports",
  },
  {
    category: "Day to day",
    question: "I made a mistake in a journal entry. Can I edit it?",
    answer:
      "No, and that's deliberate. Correction is by reversal: reverse the entry and post a correct one, so both halves stay in the account's history where an audit can see them. A filed (locked) period is never reopened.",
    guideSlug: "finance",
    sectionId: "accounting-periods",
  },
  {
    category: "Day to day",
    question: "An invoice didn't show up in my ledger. Why not?",
    answer:
      "Check the Finance dashboard's unposted documents list — it names the reason. The two common ones are a chart of accounts that hasn't been set up yet, and a document with no accounting consequence. Neither is a retryable error, so they surface on screen instead of being retried silently.",
    guideSlug: "finance",
    sectionId: "the-journal-and-automatic-posting",
  },
  {
    category: "Day to day",
    question: "Does WonderArk file my tax return for me?",
    answer:
      "No. It prepares the return — the sales and purchase registers, the reconciliation against GSTR-2B, and a readiness check across the ledger, bank and period lock. Submitting to the tax authority is still something you or your accountant do.",
    guideSlug: "finance",
    sectionId: "tax-day-to-day-workflows",
  },
  {
    category: "Day to day",
    question: "Why won't the bank import match my transactions automatically?",
    answer:
      "It suggests, it never decides. A wrong automatic match hides a real missing entry behind a plausible one, and nobody re-checks a transaction already ticked off. The amount is a gate, candidates come back ranked with reasons, and you confirm each one.",
    guideSlug: "finance",
    sectionId: "banking",
  },
  {
    category: "Day to day",
    question: "How do I import my products or my prospect list?",
    answer:
      "Both have a bulk import. Inventory takes a CSV with at least `sku` and `name`; Discovery accepts CSV, Excel or PDF and uses AI to map whatever columns your file has onto its own fields.",
    guideSlug: "inventory",
    sectionId: "setup-order",
  },
  {
    category: "Day to day",
    question: "A page shows a table on my laptop but cards on my phone. Is that a bug?",
    answer:
      "No, that's the intended behaviour platform-wide. Below the tablet breakpoint every table becomes one card per row with labelled fields, rather than a table you'd have to scroll sideways through or squint at.",
    guideSlug: "getting-started",
    sectionId: "switching-between-businesses-and-modules",
  },
  {
    category: "For administrators",
    question: "What's the difference between Admin and the Platform portal?",
    answer:
      "Admin (in the avatar menu) is your own account's business and module configuration. The Platform portal is the superadmin control plane for the whole deployment — branding, plans, feature flags, AI providers — and only platform superadmins can reach it.",
    guideSlug: "getting-started",
    sectionId: "the-superadmin-platform-portal",
  },
  {
    category: "For administrators",
    question: "Where do I set the AI key for the whole deployment?",
    answer:
      "The Platform portal's AI Providers page. A key set there is used by every account that hasn't connected its own, and takes precedence over the PLATFORM_AI_API_KEY environment variable — so you can change it without a redeploy.",
    guideSlug: "getting-started",
    sectionId: "environment-variables-for-whoever-deploys-wonderark",
  },
  {
    category: "For administrators",
    question: "How do I connect WhatsApp or Instagram to the shared inbox?",
    answer:
      "CRM → Channels. You'll need a Meta app with the relevant webhook secrets set as environment variables on the deployment before the connection can verify.",
    guideSlug: "crm",
    sectionId: "connecting-a-channel-whatsapp-instagram-facebook",
  },
  {
    category: "For administrators",
    question: "Can I call WonderArk from my own systems?",
    answer:
      "Yes — create an API key from a business's Admin → API Keys screen. Keys are business-scoped and carry the same permissions model as a person's role.",
    guideSlug: "getting-started",
    sectionId: "api-keys",
  },
];

export const FAQ_CATEGORIES: FaqCategory[] = [
  "Account & access",
  "Businesses & modules",
  "Billing & AI",
  "Day to day",
  "For administrators",
];
