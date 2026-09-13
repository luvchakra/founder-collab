"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { SystemPolicies } from "@cofounderai/core/admin/platform-system-policies";
import { updateSystemPoliciesAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P0-14.1/14.2/14.3 (Platform Policies, config-only). One dialog edits the whole
 * singleton policy at once -- there is exactly one row to change, not a list to add/remove
 * from, matching `FeaturePolicyDialog`'s own precedent for the same shape of data. Fields are
 * grouped into the same labeled sections the page itself uses, and the body scrolls
 * (`max-h-[70vh] overflow-y-auto`) since sixteen fields plus a reason don't fit one screen on
 * a phone-width viewport -- the fixed header/footer stay visible, per
 * docs/design/claude-ui-design-rules.md rule 5's "adapt ... to the available viewport."
 */
export function SystemPoliciesDialog({ policy }: { policy: SystemPolicies }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [requireUppercase, setRequireUppercase] = useState(policy.passwordRequireUppercase);
  const [requireNumber, setRequireNumber] = useState(policy.passwordRequireNumber);
  const [requireSymbol, setRequireSymbol] = useState(policy.passwordRequireSymbol);

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setFieldErrors({});
    setReason("");
    setRequireUppercase(policy.passwordRequireUppercase);
    setRequireNumber(policy.passwordRequireNumber);
    setRequireSymbol(policy.passwordRequireSymbol);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const str = (name: string) => String(formData.get(name) ?? "");
    startTransition(async () => {
      const result = await updateSystemPoliciesAction({
        sessionDurationMinutes: str("sessionDurationMinutes"),
        passwordMinLength: str("passwordMinLength"),
        passwordRequireUppercase: requireUppercase,
        passwordRequireNumber: requireNumber,
        passwordRequireSymbol: requireSymbol,
        maxFileSizeMb: str("maxFileSizeMb"),
        defaultTimezone: str("defaultTimezone"),
        defaultCurrency: str("defaultCurrency"),
        dataRetentionDefaultDays: str("dataRetentionDefaultDays"),
        auditRetentionDays: str("auditRetentionDays"),
        rateLimitApiPerMinute: str("rateLimitApiPerMinute"),
        rateLimitAiPerMinute: str("rateLimitAiPerMinute"),
        rateLimitWebhooksPerMinute: str("rateLimitWebhooksPerMinute"),
        rateLimitImportsPerHour: str("rateLimitImportsPerHour"),
        rateLimitExportsPerHour: str("rateLimitExportsPerHour"),
        rateLimitAutomationPerMinute: str("rateLimitAutomationPerMinute"),
        reason,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success("Platform policies updated.");
      resetOnOpen(false);
    });
  }

  const firstError = Object.values(fieldErrors)[0];

  return (
    <Dialog open={open} onOpenChange={resetOnOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <Settings2 className="size-4" aria-hidden="true" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>Configure platform policies</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Records defaults and ceilings only -- nothing here is enforced by any real runtime code path yet.
            Every change is recorded with your reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
            <FieldGroup title="Session & password">
              <NumberInput
                name="sessionDurationMinutes"
                label="Session duration (min)"
                defaultValue={policy.sessionDurationMinutes ?? ""}
                placeholder="No ceiling"
                error={fieldErrors.sessionDurationMinutes}
              />
              <NumberInput
                name="passwordMinLength"
                label="Password minimum length"
                defaultValue={policy.passwordMinLength}
                placeholder="e.g. 8"
                error={fieldErrors.passwordMinLength}
              />
              <div className="col-span-2 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <Checkbox checked={requireUppercase} onCheckedChange={(c) => setRequireUppercase(c === true)} />
                  Require uppercase
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <Checkbox checked={requireNumber} onCheckedChange={(c) => setRequireNumber(c === true)} />
                  Require number
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <Checkbox checked={requireSymbol} onCheckedChange={(c) => setRequireSymbol(c === true)} />
                  Require symbol
                </label>
              </div>
            </FieldGroup>

            <FieldGroup title="Files & retention">
              <NumberInput
                name="maxFileSizeMb"
                label="Max file size (MB)"
                defaultValue={policy.maxFileSizeMb ?? ""}
                placeholder="No limit"
                error={fieldErrors.maxFileSizeMb}
              />
              <NumberInput
                name="dataRetentionDefaultDays"
                label="Data retention (days)"
                defaultValue={policy.dataRetentionDefaultDays ?? ""}
                placeholder="No default"
                error={fieldErrors.dataRetentionDefaultDays}
              />
              <NumberInput
                name="auditRetentionDays"
                label="Audit retention (days)"
                defaultValue={policy.auditRetentionDays ?? ""}
                placeholder="No default"
                error={fieldErrors.auditRetentionDays}
              />
            </FieldGroup>

            <FieldGroup title="Rate limits">
              <NumberInput
                name="rateLimitApiPerMinute"
                label="API (req/min)"
                defaultValue={policy.rateLimitApiPerMinute}
                placeholder="e.g. 120"
                error={fieldErrors.rateLimitApiPerMinute}
              />
              <NumberInput
                name="rateLimitAiPerMinute"
                label="AI (req/min)"
                defaultValue={policy.rateLimitAiPerMinute ?? ""}
                placeholder="No limit"
                error={fieldErrors.rateLimitAiPerMinute}
              />
              <NumberInput
                name="rateLimitWebhooksPerMinute"
                label="Webhooks (req/min)"
                defaultValue={policy.rateLimitWebhooksPerMinute ?? ""}
                placeholder="No limit"
                error={fieldErrors.rateLimitWebhooksPerMinute}
              />
              <NumberInput
                name="rateLimitImportsPerHour"
                label="Imports (req/hr)"
                defaultValue={policy.rateLimitImportsPerHour ?? ""}
                placeholder="No limit"
                error={fieldErrors.rateLimitImportsPerHour}
              />
              <NumberInput
                name="rateLimitExportsPerHour"
                label="Exports (req/hr)"
                defaultValue={policy.rateLimitExportsPerHour ?? ""}
                placeholder="No limit"
                error={fieldErrors.rateLimitExportsPerHour}
              />
              <NumberInput
                name="rateLimitAutomationPerMinute"
                label="Automation (req/min)"
                defaultValue={policy.rateLimitAutomationPerMinute ?? ""}
                placeholder="No limit"
                error={fieldErrors.rateLimitAutomationPerMinute}
              />
            </FieldGroup>

            <FieldGroup title="Defaults for new businesses">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="defaultTimezone" className={LABEL_CLASS}>
                  Default timezone
                </Label>
                <Input
                  id="defaultTimezone"
                  name="defaultTimezone"
                  defaultValue={policy.defaultTimezone}
                  placeholder="Asia/Kolkata"
                  className={FIELD_CLASS}
                  aria-invalid={Boolean(fieldErrors.defaultTimezone)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="defaultCurrency" className={LABEL_CLASS}>
                  Default currency
                </Label>
                <Input
                  id="defaultCurrency"
                  name="defaultCurrency"
                  defaultValue={policy.defaultCurrency}
                  placeholder="INR"
                  maxLength={3}
                  className={FIELD_CLASS}
                  aria-invalid={Boolean(fieldErrors.defaultCurrency)}
                />
              </div>
            </FieldGroup>
          </div>

          {firstError && (
            <p role="alert" className="text-xs text-red-400">
              {firstError}
            </p>
          )}

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Tightening password requirements ahead of the security review"
              className={FIELD_CLASS}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={() => resetOnOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || reason.trim().length === 0}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-zinc-800 pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function NumberInput({
  name,
  label,
  defaultValue,
  placeholder,
  error,
}: {
  name: string;
  label: string;
  defaultValue: string | number;
  placeholder: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name} className={LABEL_CLASS}>
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={FIELD_CLASS}
        aria-invalid={Boolean(error)}
      />
    </div>
  );
}
