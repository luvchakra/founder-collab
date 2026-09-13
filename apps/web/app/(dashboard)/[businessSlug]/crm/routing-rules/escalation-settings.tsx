import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { EscalationConfig } from "@cofounderai/module-crm/lib/escalation/types";
import type { EmployeeOption } from "@cofounderai/module-crm/lib/routing-rules/types";

/**
 * CRM-09.8's own settings surface: who "manager escalation" (the ladder's final rung)
 * assigns an unresolved commercial message to. The three delay times themselves are
 * shown read-only, not editable here -- "store business configuration" (this story's
 * own requirement) is satisfied by `crm.escalation_config` being a real, per-business
 * database row rather than a hardcoded constant; a settings screen for editing those
 * delays is deliberately deferred rather than built speculatively (confirmed with the
 * user).
 */
export function EscalationSettings({ config, employees, action }: { config: EscalationConfig; employees: EmployeeOption[]; action: (formData: FormData) => Promise<void> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Escalation</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          <li>New inquiry unanswered for {config.reminderDelayMinutes}m -&gt; reminder</li>
          <li>Unanswered for {config.ownerEscalationDelayMinutes}m -&gt; owner escalation</li>
          <li>Unanswered for {config.managerEscalationDelayMinutes}m -&gt; manager escalation</li>
        </ul>
        <form action={action} className="flex flex-col gap-1.5">
          <Label htmlFor="managerEmployeeId">Escalation manager</Label>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect id="managerEmployeeId" name="managerEmployeeId" defaultValue={config.managerEmployeeId ?? ""} className="w-auto">
              <option value="">No one assigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name ?? e.email ?? e.id}
                </option>
              ))}
            </NativeSelect>
            <SubmitButton size="sm" variant="outline" pendingText="Saving...">
              Save
            </SubmitButton>
          </div>
          <p className="text-xs text-muted-foreground">Who an unresolved message is assigned to once it reaches manager escalation.</p>
        </form>
      </CardContent>
    </Card>
  );
}
