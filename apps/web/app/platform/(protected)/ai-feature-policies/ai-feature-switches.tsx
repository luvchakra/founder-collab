import type { AiOperationSwitch } from "@cofounderai/core/admin/platform-ai-operation-switches";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { ReasonActionDialog } from "../../reason-action-dialog";
import { setAiOperationEnabledAction } from "./actions";

/**
 * PLATFORM-P0-10.4 ("AI Feature Kill Switch") -- one row per AI feature in the operation
 * registry, each switchable off platform-wide without touching its module's licence.
 * Desktop table / mobile stacked list, per PLATFORM-P0-19.3/19.4.
 */
export function AiFeatureSwitches({ switches }: { switches: AiOperationSwitch[] }) {
  const disabledCount = switches.filter((s) => !s.enabled).length;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 p-4">
      <div>
        <h2 className="text-sm font-medium text-zinc-100">AI feature kill switches</h2>
        <p className="text-xs text-zinc-500">
          Turn one AI feature off for every business without disabling its module. Takes effect on the next request.
          {disabledCount > 0 ? ` ${disabledCount} switched off.` : ""}
        </p>
      </div>
      <ul className="divide-y divide-zinc-800 md:hidden">
        {switches.map((s) => (
          <li key={s.operation} className="flex items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate text-zinc-100">{s.label}</p>
              {!s.enabled && s.reason ? <p className="truncate text-xs text-zinc-500">{s.reason}</p> : null}
            </div>
            <SwitchAction s={s} />
          </li>
        ))}
      </ul>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400">Feature</TableHead>
            <TableHead className="text-zinc-400">Status</TableHead>
            <TableHead className="text-zinc-400">Last reason</TableHead>
            <TableHead className="text-right text-zinc-400">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {switches.map((s) => (
            <TableRow key={s.operation} className="border-zinc-800 hover:bg-zinc-900/60">
              <TableCell className="text-zinc-100">
                {s.label}
                <span className="block font-mono text-xs text-zinc-500">{s.operation}</span>
              </TableCell>
              <TableCell>
                <Badge variant={s.enabled ? "default" : "destructive"}>{s.enabled ? "On" : "Off"}</Badge>
              </TableCell>
              <TableCell className="max-w-56 truncate text-xs text-zinc-400">{s.reason ?? "—"}</TableCell>
              <TableCell className="text-right">
                <SwitchAction s={s} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function SwitchAction({ s }: { s: AiOperationSwitch }) {
  const turningOff = s.enabled;
  return (
    <ReasonActionDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          {turningOff ? "Switch off" : "Switch on"}
        </Button>
      }
      title={turningOff ? `Switch off ${s.label}?` : `Switch ${s.label} back on?`}
      description={
        turningOff
          ? "Every business loses this AI feature immediately; their module and other AI features keep working."
          : "Every business with access to this feature can use it again."
      }
      confirmLabel={turningOff ? "Switch off" : "Switch on"}
      confirmText={turningOff ? s.operation : undefined}
      destructive={turningOff}
      successMessage={turningOff ? `${s.label} switched off.` : `${s.label} switched on.`}
      action={setAiOperationEnabledAction.bind(null, s.operation, !s.enabled)}
    />
  );
}
