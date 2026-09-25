import type { ActivityEntry } from "../../lib/marketing/queries";

function describe(entry: ActivityEntry): string {
  const verb = entry.action.split(".").pop() ?? entry.action;
  const from = entry.before?.status;
  const to = entry.after?.status;
  if (typeof from === "string" && typeof to === "string") return `Status ${from} → ${to}`;
  return verb.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** The audit trail for one record, as a compact timeline (§9.4 "activity timeline"). */
export function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  return (
    <ol className="flex flex-col gap-2 border-l pl-4">
      {entries.map((e) => (
        <li key={e.id} className="relative text-sm">
          <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" aria-hidden="true" />
          <p>{describe(e)}</p>
          <p className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("en-IN")}</p>
        </li>
      ))}
    </ol>
  );
}
