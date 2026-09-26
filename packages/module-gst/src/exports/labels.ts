import type { PaymentStatus } from "../lib/accounting/aging";
import type { BankTransactionRow } from "../lib/accounting/banking-queries";
import type { CheckStatus } from "../lib/accounting/filing-readiness";
import type { AccountingMethod } from "../lib/activation/types";
import type { BackfillCandidateKind } from "../lib/backfill/types";
import type { EvidenceType, RelatedEntityType } from "../lib/evidence/types";
import type { ExceptionStatus, ExceptionType } from "../lib/exceptions/types";
import type { FinanceExceptionStatus, FinanceExceptionType } from "../lib/exceptions-queue/types";
import type { RiskSeverity, RiskSignalKind } from "../lib/risk/types";

/**
 * EXP-FIN-01..17 -- the human labels Finance exports write instead of enum codes (§43).
 *
 * Where a label map is already exported from `lib/` (`JOURNAL_STATUS_LABEL`,
 * `AGING_BUCKET_LABELS`, `RECURRENCE_LABEL`, `PERIOD_STATUS_LABEL`, `ACCOUNT_TYPE_LABEL`)
 * the adapters import it directly. The maps below exist only as component-local constants
 * inside client components (a `"use client"` module hands server code a client reference,
 * not its values), so each is copied here word for word, with the component it mirrors
 * named -- keep the two in step.
 */

/** bills-view.tsx / payables-view.tsx / receivables-view.tsx `STATUS_LABEL`. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Part paid",
  paid: "Paid",
  overpaid: "Overpaid",
};

/** bank-transactions-view.tsx `STATUS_LABEL`. */
export const BANK_TRANSACTION_STATUS_LABEL: Record<BankTransactionRow["status"], string> = {
  unmatched: "To match",
  matched: "Matched",
  reconciled: "Reconciled",
  ignored: "Set aside",
};

/** exceptions/finance-exceptions-list.tsx `EXCEPTION_TYPE_LABEL` and its `StatusBadge`. */
export const FINANCE_EXCEPTION_TYPE_LABEL: Record<FinanceExceptionType, string> = {
  unposted_document: "Unposted document",
  unposted_payment: "Unposted payment",
  itc_at_risk: "ITC at risk",
  filing_blocker: "Filing blocker",
};
export const FINANCE_EXCEPTION_STATUS_LABEL: Record<FinanceExceptionStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  ignored: "Ignored",
};

/** reconciliation/exceptions-list.tsx `EXCEPTION_TYPE_LABEL` and its `StatusBadge`. */
export const RECONCILIATION_EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  supplier_mismatch: "Supplier mismatch",
  missing_in_2b: "Missing in GSTR-2B",
  missing_in_books: "Missing in books",
  ims_pending: "IMS pending",
};
export const RECONCILIATION_EXCEPTION_STATUS_LABEL: Record<ExceptionStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

/** evidence/evidence-list.tsx `EVIDENCE_TYPE_LABEL`. */
export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  return_acknowledgment: "Return acknowledgment",
  payment_challan: "Payment challan",
  government_notice: "Government notice",
  audit_response: "Audit response",
  other: "Other",
};

/** What an evidence row or a risk signal is about. No component names these (the list
 * links to the row instead), so plain words for the stored entity types. */
export const RELATED_ENTITY_LABEL: Record<RelatedEntityType | "document" | "item", string> = {
  return_period: "Return period",
  einvoice: "E-invoice",
  eway_bill: "E-way bill",
  reconciliation_exception: "Reconciliation exception",
  tax_registration: "Tax registration",
  document: "Document",
  item: "Item",
};

/** risk/risk-signals-list.tsx `KIND_LABEL` and risk/severity-badge.tsx labels. */
export const RISK_KIND_LABEL: Record<RiskSignalKind, string> = {
  return_not_approved: "Return not approved",
  einvoice_deadline: "E-invoice deadline",
  unmatched_itc: "Unmatched ITC",
  missing_tax_registration: "Missing tax registration",
  invalid_classification: "Invalid classification",
  failed_submission: "Failed submission",
};
export const RISK_SEVERITY_LABEL: Record<RiskSeverity, string> = { high: "High", medium: "Medium", low: "Low" };

/** accounting/filing-readiness-view.tsx `STATUS` labels. */
export const READINESS_STATUS_LABEL: Record<CheckStatus, string> = {
  pass: "Fine",
  warn: "Worth a look",
  block: "Must fix",
  unknown: "Can't tell",
};

/** activation/activation-settings-form.tsx options. */
export const ACCOUNTING_METHOD_LABEL: Record<AccountingMethod, string> = { accrual: "Accrual", cash: "Cash" };
export const MONTH_LABEL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const BACKFILL_KIND_LABEL: Record<BackfillCandidateKind, string> = {
  document: "Document",
  payment_allocation: "Payment allocation",
};

/** Where a journal entry came from, as journal-list.tsx shows it: "By hand" for Finance's
 * own manual entries, otherwise the posting module by name. */
const SOURCE_MODULE_LABEL: Record<string, string> = {
  finance: "Finance",
  service: "Service",
  inventory: "Inventory",
  crm: "CRM",
  discovery: "Discovery",
};
export function journalSourceLabel(sourceModule: string | null): string {
  if (!sourceModule || sourceModule === "finance") return "By hand";
  return SOURCE_MODULE_LABEL[sourceModule] ?? sourceModule;
}

/** The module a shared `core.documents` row was raised in. */
export function moduleLabel(sourceModule: string | null): string {
  if (!sourceModule) return "";
  return SOURCE_MODULE_LABEL[sourceModule] ?? humanizeCode(sourceModule);
}

/** A stored snake_case code as words, for codes no page has a label map for
 * (`supplier_bill` -> "Supplier bill"). */
export function humanizeCode(code: string | null | undefined): string {
  if (!code) return "";
  const words = code.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
