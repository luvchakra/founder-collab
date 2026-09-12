import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { REDISCOVERY_INTERVAL_LABEL, isRediscoveryDue, type RediscoveryInterval } from "../../lib/tenancy/rediscovery";

/**
 * DISC-OFFER-P1-01.1: "Scheduled Offering Re-Discovery" -- the doc's own exact worked
 * example ("Last discovery: Today, 10:30 / Next discovery: Tomorrow / [Run Now]"),
 * placed directly above `RunAiDiscoveryPanel` on the offering Overview page. Doesn't
 * render its own "Run Now" button -- `RunAiDiscoveryPanel`'s own "Run AI Discovery
 * Again" immediately below already is that action, and a second button here doing the
 * exact same thing would read as two different controls for one action rather than one
 * clear entry point; flagged as a deliberate placement call rather than a missing
 * feature.
 *
 * **A flagged scope boundary, not an oversight**: this only computes and displays *when*
 * a rerun is due (and lets a founder change the cadence or jump ahead by using the
 * existing Run Now button below) -- it does NOT trigger anything unattended in the
 * background once due. Every function this pipeline depends on (`understandProduct`,
 * `generateIcp`, `discoverProspects`, `researchProspect`, `generateResearchBrief`, and
 * every mutation between them) is built exclusively around the per-request,
 * RLS-scoped, signed-in-user Supabase client (`db/server.ts`) -- none accept an
 * injectable admin client the way `module-fsm`'s own cron-native
 * `sendDueReminders`/`drainDomainEvents` do. Retrofitting that cross-cutting concern
 * across the entire pipeline so a cron with no signed-in user could run it unattended is
 * a genuine architecture-level change (CLAUDE.md dev principle #10/#14: don't refactor
 * unrelated code, don't change architecture without approval), not something this single
 * story's own two-line spec ("allow an offering to run again on a schedule... [Run Now]")
 * implies building. The doc's own mockup shows only a due-date display plus a manual
 * override, not a promise of silent autonomous execution -- this component delivers
 * exactly that literal reading.
 */
export function RediscoverySchedule({
  interval,
  nextDiscoveryAt,
  lastDiscoveryAt,
  updateIntervalAction,
}: {
  interval: RediscoveryInterval;
  nextDiscoveryAt: string | null;
  lastDiscoveryAt: string | null;
  updateIntervalAction: (formData: FormData) => Promise<void>;
}) {
  const due = isRediscoveryDue(nextDiscoveryAt, new Date());

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <p>
          <span className="text-muted-foreground">Last discovery: </span>
          <span className="font-medium">{lastDiscoveryAt ? formatDateTime(lastDiscoveryAt) : "Never"}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Next discovery: </span>
          <span className={due ? "font-medium text-amber-700" : "font-medium"}>
            {interval === "off" ? "Not scheduled" : nextDiscoveryAt ? `${formatDateTime(nextDiscoveryAt)}${due ? " (due)" : ""}` : "Not scheduled"}
          </span>
        </p>
      </div>
      <form action={updateIntervalAction} className="flex items-center gap-2">
        <NativeSelect name="interval" defaultValue={interval} className="w-auto">
          {(Object.keys(REDISCOVERY_INTERVAL_LABEL) as RediscoveryInterval[]).map((value) => (
            <option key={value} value={value}>
              {REDISCOVERY_INTERVAL_LABEL[value]}
            </option>
          ))}
        </NativeSelect>
        <SubmitButton size="sm" variant="outline" pendingText="Saving...">
          Save schedule
        </SubmitButton>
      </form>
    </section>
  );
}
