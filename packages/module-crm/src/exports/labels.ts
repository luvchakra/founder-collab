import type { EmployeeOption } from "../lib/tickets/types";

/**
 * EXP-CRM-01..10 -- the human labels CRM exports write instead of raw enum codes (§43).
 * Where a CRM page already has its own label map it is mirrored here word for word
 * (review status, exception module); everything else is the same "capitalized, words
 * not underscores" text the pages render with `capitalize`/`replaceAll("_", " ")`.
 */

/** `general_enquiry` -> `General enquiry`. Blank stays blank. */
export function humanize(code: string | null | undefined): string {
  if (!code) return "";
  const text = code.replaceAll("_", " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function labelOf(map: Record<string, string>, code: string | null | undefined): string {
  if (!code) return "";
  return map[code] ?? humanize(code);
}

export const SOURCE_CHANNEL_LABEL: Record<string, string> = {
  discovery: "Discovery",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  website: "Website",
  referral: "Referral",
  manual: "Manual",
  fsm: "FSM",
  existing_customer: "Existing customer",
  other: "Other",
};

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook_messenger: "Facebook Messenger",
  google_business_messages: "Google Business Messages",
  google_business_profile: "Google Business Profile",
  email: "Email",
  sms: "SMS",
  website: "Website",
  manual: "Manual",
  other: "Other",
};

/** Same wording as the Reviews page's own STATUS_LABEL (reviews-list.tsx). */
export const REVIEW_STATUS_LABEL: Record<string, string> = {
  new: "Awaiting reply",
  in_progress: "In progress",
  responded: "Replied",
  dismissed: "Dismissed",
};

/** Same wording as the Exceptions page's own MODULE_LABEL. */
export const MODULE_LABEL: Record<string, string> = { fsm: "FSM", crm: "CRM", inventory: "Inventory", discovery: "Discovery" };

export const EXCEPTION_KIND_LABEL: Record<string, string> = {
  fsm_parts_shortage: "Job short on parts",
  assessment_pending: "Assessment pending",
};

/** An employee's display name exactly as CRM pages show it; `Unassigned` when nobody owns
 * the record (the pages' own explicit "Unassigned" state, not a blank). */
export function ownerName(employeeById: Map<string, EmployeeOption>, ownerId: string | null | undefined): string {
  if (!ownerId) return "Unassigned";
  const employee = employeeById.get(ownerId);
  return employee ? (employee.full_name ?? employee.email ?? "Unnamed") : "Unknown";
}

export function employeeMap(employees: EmployeeOption[]): Map<string, EmployeeOption> {
  return new Map(employees.map((e) => [e.id, e]));
}
