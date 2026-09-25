import Link from "next/link";
import { CONTENT_STATUS_LABEL, type MarketingContent } from "../../lib/marketing/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * MKT-10 — the content calendar (§15): a month grid of scheduled and published content.
 * Moving an item is done from its page ("Reschedule"), which only changes the date —
 * nothing on the calendar can publish. On a phone the grid collapses to a dated list.
 */
export function ContentCalendar({
  month,
  items,
  root,
}: {
  month: string;
  items: MarketingContent[];
  root: string;
}) {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(year, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;

  const byDay = new Map<number, MarketingContent[]>();
  for (const item of items) {
    const when = item.scheduledAt ?? item.publishedAt;
    if (!when || !when.startsWith(month)) continue;
    const day = Number(when.slice(8, 10));
    const list = byDay.get(day) ?? [];
    list.push(item);
    byDay.set(day, list);
  }

  const cells: (number | null)[] = [...Array(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = new Date().toISOString().slice(0, 10);

  const chip = (item: MarketingContent) => (
    <Link
      key={item.id}
      href={`${root}/content/${item.id}`}
      className={`block truncate rounded px-1.5 py-0.5 text-xs ${
        item.status === "published" ? "bg-success/12 text-success-subtle" : "bg-primary/10 text-primary"
      }`}
      title={`${item.title} · ${CONTENT_STATUS_LABEL[item.status]}`}
    >
      {item.title}
    </Link>
  );

  return (
    <>
      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-t border-l text-xs">
          {WEEKDAYS.map((d) => (
            <div key={d} className="border-r border-b bg-muted/40 px-2 py-1 font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            const iso = day ? `${month}-${String(day).padStart(2, "0")}` : null;
            return (
              <div key={i} className={`min-h-24 border-r border-b p-1 ${day ? "" : "bg-muted/20"}`}>
                {day ? (
                  <>
                    <p className={`mb-1 text-right ${iso === today ? "font-semibold text-primary" : "text-muted-foreground"}`}>{day}</p>
                    <div className="flex flex-col gap-1">{(byDay.get(day) ?? []).map(chip)}</div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {[...byDay.entries()]
          .sort(([a], [b]) => a - b)
          .map(([day, list]) => (
            <li key={day}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {new Date(Date.UTC(year, m - 1, day)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              <div className="flex flex-col gap-1">{list.map(chip)}</div>
            </li>
          ))}
        {byDay.size === 0 ? <li className="text-sm text-muted-foreground">Nothing scheduled this month.</li> : null}
      </ul>
    </>
  );
}
