import type { FollowUpPriority, FollowUpQueueRow } from "./types";

export type FollowUpQueueView = "all" | "due_today" | "overdue" | "upcoming" | "unassigned" | "high_priority";

export type FollowUpQueueFilters = {
  view?: FollowUpQueueView;
  ownerId?: string;
  source?: string;
  channel?: string;
  priority?: FollowUpPriority;
};

/**
 * CRM-05.3: "Views: due today, overdue, upcoming, unassigned, high-priority" plus
 * "filters by owner, source, channel and priority" -- both applied here, as one pure
 * function over the queue the page already fetched, rather than five separate queries
 * per view (the queue is already scoped to `status = 'pending'` by
 * `listFollowUpQueue()`, so every view/filter combination here only ever narrows that
 * one open set, never re-includes completed/cancelled items). `now` is a parameter (not
 * read internally) so this stays a pure, unit-testable function -- the page passes the
 * real clock, tests pass a fixed one.
 */
export function applyFollowUpQueueFilters(rows: FollowUpQueueRow[], filters: FollowUpQueueFilters, now: Date): FollowUpQueueRow[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

  let result = rows;
  switch (filters.view) {
    case "due_today":
      result = result.filter((r) => {
        const dueAt = new Date(r.due_at).getTime();
        return dueAt >= todayStart && dueAt <= todayEnd;
      });
      break;
    case "overdue":
      result = result.filter((r) => new Date(r.due_at).getTime() < todayStart);
      break;
    case "upcoming":
      result = result.filter((r) => new Date(r.due_at).getTime() > todayEnd);
      break;
    case "unassigned":
      result = result.filter((r) => !r.owner_id);
      break;
    case "high_priority":
      result = result.filter((r) => r.priority === "high");
      break;
    default:
      break;
  }

  if (filters.ownerId) result = result.filter((r) => r.owner_id === filters.ownerId);
  if (filters.source) result = result.filter((r) => r.source === filters.source);
  if (filters.channel) result = result.filter((r) => r.channel === filters.channel);
  if (filters.priority) result = result.filter((r) => r.priority === filters.priority);

  return result;
}
