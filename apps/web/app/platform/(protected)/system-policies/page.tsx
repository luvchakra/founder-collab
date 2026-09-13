import type { ReactNode } from "react";
import { getSystemPolicies } from "@cofounderai/core/admin/platform-system-policies";
import { Badge } from "@cofounderai/core/ui/badge";
import { SystemPoliciesDialog } from "./system-policies-dialog";

/**
 * PLATFORM-P0-14.1/14.2/14.3 ("Platform Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §18) -- CONFIG-ONLY. See `platform-system-policies.ts` and its migration's own docstrings for
 * the full reasoning: this page shows and edits platform-wide default/ceiling values -- nothing
 * here is enforced by any real session, signup, upload, retention-purge, or rate-limiting code
 * path yet.
 *
 * A single settings surface, not a list of rows -- there is exactly one policy row (singleton
 * `platform.system_policies`), so there is no table/mobile-card split to make (CLAUDE.md
 * development principle #12 targets a page whose *primary* content is a table of many rows),
 * mirroring `/platform/ai-feature-policies`'s own identical reasoning for the identical shape
 * of data. Fields are grouped into labeled sections (Session & Password, Files & Retention,
 * Rate Limits, Defaults) rather than one flat sixteen-row list, per
 * docs/design/claude-ui-design-rules.md rule 1 ("group related information logically").
 */
export default async function PlatformSystemPoliciesPage() {
  const policy = await getSystemPolicies();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Platform Policies</h1>
        <p className="text-sm text-zinc-400">
          Platform-wide default and ceiling values -- configuration only, nothing here is enforced by any real
          runtime code path yet. Every change is recorded with a reason. Country/regime-specific rules (e.g.
          GST retention, tax content) always take precedence over these platform-wide defaults where applicable.
        </p>
      </div>

      <div className="flex flex-col gap-5 rounded-2xl border border-zinc-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-100">Current policy</h2>
          <SystemPoliciesDialog policy={policy} />
        </div>

        <Section title="Session & password">
          <Field label="Session duration">
            <Ceiling value={policy.sessionDurationMinutes} unit=" min" empty="No ceiling configured" />
          </Field>
          <Field label="Password minimum length">
            <span className="text-zinc-100">{policy.passwordMinLength} characters</span>
          </Field>
          <Field label="Password complexity">
            <div className="flex flex-wrap gap-1">
              <Badge variant={policy.passwordRequireUppercase ? "default" : "secondary"}>
                Uppercase {policy.passwordRequireUppercase ? "required" : "optional"}
              </Badge>
              <Badge variant={policy.passwordRequireNumber ? "default" : "secondary"}>
                Number {policy.passwordRequireNumber ? "required" : "optional"}
              </Badge>
              <Badge variant={policy.passwordRequireSymbol ? "default" : "secondary"}>
                Symbol {policy.passwordRequireSymbol ? "required" : "optional"}
              </Badge>
            </div>
          </Field>
        </Section>

        <Section title="Files & retention">
          <Field label="Max file size">
            <Ceiling value={policy.maxFileSizeMb} unit=" MB" empty="No limit configured" />
          </Field>
          <Field label="Data retention default">
            <Ceiling value={policy.dataRetentionDefaultDays} unit=" days" empty="No default configured" />
          </Field>
          <Field label="Audit retention">
            <Ceiling value={policy.auditRetentionDays} unit=" days" empty="No default configured" />
          </Field>
        </Section>

        <Section title="Rate limits">
          <Field label="API">
            <span className="text-zinc-100">{policy.rateLimitApiPerMinute} req/min</span>
          </Field>
          <Field label="AI">
            <Ceiling value={policy.rateLimitAiPerMinute} unit=" req/min" empty="No limit configured" />
          </Field>
          <Field label="Webhooks">
            <Ceiling value={policy.rateLimitWebhooksPerMinute} unit=" req/min" empty="No limit configured" />
          </Field>
          <Field label="Imports">
            <Ceiling value={policy.rateLimitImportsPerHour} unit=" req/hr" empty="No limit configured" />
          </Field>
          <Field label="Exports">
            <Ceiling value={policy.rateLimitExportsPerHour} unit=" req/hr" empty="No limit configured" />
          </Field>
          <Field label="Automation">
            <Ceiling value={policy.rateLimitAutomationPerMinute} unit=" req/min" empty="No limit configured" />
          </Field>
        </Section>

        <Section title="Defaults for new businesses">
          <Field label="Default timezone">
            <span className="text-zinc-100">{policy.defaultTimezone}</span>
          </Field>
          <Field label="Default currency">
            <span className="text-zinc-100">{policy.defaultCurrency}</span>
          </Field>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-zinc-800 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="flex flex-col gap-3 text-sm">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function Ceiling({ value, unit, empty }: { value: number | null; unit: string; empty: string }) {
  return (
    <span className={value === null ? "text-zinc-500" : "text-zinc-100"}>
      {value === null ? empty : `${value.toLocaleString()}${unit}`}
    </span>
  );
}
