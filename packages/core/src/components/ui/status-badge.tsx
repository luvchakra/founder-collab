import { Badge } from "./badge";
import { cn } from "../../lib/utils";

export type StatusTone = "success" | "warning" | "destructive" | "default" | "secondary";

/**
 * One status color mapping for the whole platform (UI-UX-UNIFORMITY.md §3b): blue for
 * in-progress/informational, green for done/positive, amber for pending/needs-attention,
 * red for failed/cancelled/overdue, gray for everything with no such meaning.
 *
 * Every module has its own status enum (FSM job, GST filing, inventory PO, CRM ticket,
 * discovery prospect) that maps onto those same five ideas, so the color is matched to
 * the meaning here once rather than re-decided per module — a user working across
 * modules then learns the color code once.
 */
const TONE_BY_STATUS: Record<StatusTone, readonly string[]> = {
  success: [
    "active", "approved", "closed_won", "complete", "completed", "delivered", "filed",
    "fulfilled", "granted", "in_stock", "licensed", "paid", "published", "received",
    "reconciled", "resolved", "success", "succeeded", "verified", "won",
  ],
  warning: [
    "awaiting", "draft", "due", "hold", "low", "low_stock", "on_hold", "partial",
    "partially_paid", "pending", "review", "scheduled", "unpaid", "warning",
  ],
  destructive: [
    "blocked", "cancelled", "canceled", "closed_lost", "declined", "denied", "error",
    "expired", "failed", "lost", "out_of_stock", "overdue", "rejected", "suspended",
    "unlicensed", "void", "voided",
  ],
  default: [
    "assigned", "contacted", "dispatched", "in_progress", "in_transit", "negotiation",
    "new", "open", "processing", "proposal_sent", "qualified", "replied", "running",
    "sent", "submitted",
  ],
  secondary: [],
};

const TONE_LOOKUP: ReadonlyMap<string, StatusTone> = new Map(
  (Object.entries(TONE_BY_STATUS) as [StatusTone, readonly string[]][]).flatMap(
    ([tone, statuses]) => statuses.map((status) => [status, tone] as const),
  ),
);

/** Normalizes the spelling differences between modules ("In Progress", "in-progress",
 * "IN_PROGRESS") onto the one key the mapping above is written in. */
function normalize(status: string): string {
  return status.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function statusTone(status: string): StatusTone {
  return TONE_LOOKUP.get(normalize(status)) ?? "secondary";
}

function humanize(status: string): string {
  return status
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string;
  /** Overrides the humanized status text when a module has its own wording for it. */
  label?: string;
  /** Overrides the mapping for a status whose meaning this component can't infer. */
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <Badge variant={tone ?? statusTone(status)} className={cn("whitespace-nowrap", className)}>
      {label ?? humanize(status)}
    </Badge>
  );
}
