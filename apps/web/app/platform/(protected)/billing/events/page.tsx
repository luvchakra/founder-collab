import Link from "next/link";
import { listPlatformBillingEvents } from "@cofounderai/core/admin/platform-billing-ops";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import {
  EVENT_STATUSES,
  EmptyState,
  EnvironmentBadge,
  EventStatusBadge,
  FilterBar,
  FilterSelect,
  PROVIDER_OPTIONS,
  ProviderLabel,
  formatWhen,
  pickParam,
} from "../billing-ui";
import { RetryEventButton } from "./retry-event-button";

/**
 * BILL-30 -- stored webhook events (§39, §44, §96): type and processing state with a safe
 * error summary, never the raw payload. Failed and unhandled events can be re-processed
 * from their stored, already-verified payload.
 */
export default async function PlatformBillingEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = pickParam(params.status, EVENT_STATUSES);
  const provider = pickParam(params.provider, ["razorpay", "stripe"] as const);
  const events = await listPlatformBillingEvents({ status, provider });
  const filtered = Boolean(status || provider);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar resetHref="/platform/billing/events">
        <FilterSelect name="status" label="Status" value={status} options={EVENT_STATUSES.map((s) => ({ value: s, label: s }))} />
        <FilterSelect name="provider" label="Provider" value={provider} options={PROVIDER_OPTIONS} />
      </FilterBar>

      {events.length === 0 ? (
        <EmptyState>{filtered ? "No webhook events match these filters." : "No webhook events yet."}</EmptyState>
      ) : (
        <div className="rounded-2xl border border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Received</TableHead>
                <TableHead className="text-zinc-400">Provider</TableHead>
                <TableHead className="text-zinc-400">Event</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Attempts</TableHead>
                <TableHead className="text-zinc-400">Business</TableHead>
                <TableHead className="text-zinc-400">Error</TableHead>
                <TableHead className="text-right text-zinc-400">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id} className="border-zinc-800 hover:bg-zinc-900/60">
                  <TableCell className="whitespace-nowrap text-zinc-300">
                    {formatWhen(e.receivedAt)}
                    {e.processedAt ? <p className="text-xs text-zinc-500">processed {formatWhen(e.processedAt)}</p> : null}
                  </TableCell>
                  <TableCell className="text-zinc-300">
                    <div className="flex items-center gap-2">
                      <ProviderLabel provider={e.provider} />
                      <EnvironmentBadge environment={e.environment} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-mono text-xs text-zinc-100">{e.eventType}</p>
                    <p className="font-mono text-xs break-all text-zinc-500">{e.providerEventId}</p>
                  </TableCell>
                  <TableCell>
                    <EventStatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="text-zinc-300">{e.attemptCount}</TableCell>
                  <TableCell className="text-zinc-300">
                    {e.subscriptionId ? (
                      <Link href={`/platform/billing/subscriptions/${e.subscriptionId}`} className="hover:underline">
                        {e.businessName ?? "Subscription"}
                      </Link>
                    ) : (
                      (e.businessName ?? "—")
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 text-xs text-red-400">
                    {e.errorCode ? <span className="font-mono">{e.errorCode}</span> : null}
                    {e.errorCode && e.errorMessage ? " — " : null}
                    {e.errorMessage}
                  </TableCell>
                  <TableCell className="text-right">
                    {e.status === "failed" || e.status === "unhandled" ? <RetryEventButton eventId={e.id} /> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {events.length >= 200 ? <p className="text-xs text-zinc-500">Showing the 200 most recent. Narrow the filters to see older ones.</p> : null}
    </div>
  );
}
