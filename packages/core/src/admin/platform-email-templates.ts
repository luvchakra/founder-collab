import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";

/**
 * PLATFORM-P0-11.2 ("System Email Templates", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §15). See the migration's own docstring (`20260912410000_platform_email_templates.sql`)
 * for the entity-ownership reasoning (genuinely distinct from `core.message_templates`,
 * which is business-scoped and freely named) and for why this is config-only -- no real
 * email-sending code renders any of these yet.
 */

export const EMAIL_TEMPLATE_KEYS = [
  "welcome",
  "verification",
  "password_security",
  "subscription",
  "usage_limits",
  "compliance_reminders",
  "system_announcements",
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  welcome: "Welcome",
  verification: "Verification",
  password_security: "Password / security events",
  subscription: "Subscription",
  usage_limits: "Usage limits",
  compliance_reminders: "Compliance reminders",
  system_announcements: "System announcements",
};

export type EmailTemplate = {
  templateKey: EmailTemplateKey;
  label: string;
  subject: string | null;
  body: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

type EmailTemplateRow = {
  template_key: EmailTemplateKey;
  subject: string | null;
  body: string | null;
  updated_at: string;
  updated_by: string | null;
};

function toTemplate(row: EmailTemplateRow): EmailTemplate {
  return {
    templateKey: row.template_key,
    label: EMAIL_TEMPLATE_LABELS[row.template_key],
    subject: row.subject,
    body: row.body,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** All seven templates, in the fixed order §15's own text lists them -- not
 * alphabetical/database order, so the admin page always reads in the doc's own order. */
export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase.from("email_templates").select("*");
  if (error) throw error;
  const byKey = new Map((data as EmailTemplateRow[]).map((row) => [row.template_key, row]));
  return EMAIL_TEMPLATE_KEYS.map((key) => {
    const row = byKey.get(key);
    if (!row) throw new Error(`Missing seeded email template row: ${key}`);
    return toTemplate(row);
  });
}

const reasonSchema = z
  .string()
  .trim()
  .min(1, "A reason is required.")
  .max(500, "Reason must be 500 characters or fewer.");

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v));

export const updateEmailTemplateSchema = z.object({
  templateKey: z.enum(EMAIL_TEMPLATE_KEYS),
  subject: optionalText,
  body: optionalText,
  reason: reasonSchema,
});
export type UpdateEmailTemplateInput = z.input<typeof updateEmailTemplateSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function updateEmailTemplate(
  input: UpdateEmailTemplateInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  await requireSuperadmin();
  const parsed = updateEmailTemplateSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsFrom(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
  }

  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("update_email_template", {
    p_template_key: parsed.data.templateKey,
    p_subject: parsed.data.subject,
    p_body: parsed.data.body,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
