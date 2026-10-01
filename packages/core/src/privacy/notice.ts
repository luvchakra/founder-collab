/**
 * Version of the privacy notice at /privacy. Bump it whenever the notice changes in a
 * way users must re-acknowledge (new purpose, new category of data, new recipient):
 * every user whose latest `terms_privacy` consent is for an older version is sent
 * through /consent again on their next dashboard visit (DPDP s.5 / GDPR Art. 13 --
 * notice must precede processing for the new purpose).
 */
export const PRIVACY_NOTICE_VERSION = "2026-10-01";

export type ConsentPurpose = "terms_privacy" | "marketing_communications";

export type DsrType =
  | "access"
  | "portability"
  | "correction"
  | "erasure"
  | "restriction"
  | "objection"
  | "withdraw_consent"
  | "grievance"
  | "nomination";

export const DSR_TYPE_LABELS: Record<DsrType, string> = {
  access: "Access my data",
  portability: "Data portability",
  correction: "Correct my data",
  erasure: "Erase my data",
  restriction: "Restrict processing",
  objection: "Object to processing",
  withdraw_consent: "Withdraw consent",
  grievance: "Grievance (DPDP s.13)",
  nomination: "Nominate a representative (DPDP s.14)",
};

export interface DataSubjectRequest {
  id: string;
  requester_user_id: string | null;
  business_id: string | null;
  subject_email: string | null;
  request_type: DsrType;
  details: string | null;
  status: "received" | "in_progress" | "completed" | "rejected";
  response: string | null;
  due_at: string;
  completed_at: string | null;
  created_at: string;
}
