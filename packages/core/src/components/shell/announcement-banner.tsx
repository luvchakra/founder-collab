import type { CustomerAnnouncement } from "../../announcements/active";

/**
 * PLATFORM-P1-10.13: the platform's active notices for the business being used, above the
 * page. Nothing at all when there are none.
 */
const TONE: Record<CustomerAnnouncement["type"], string> = {
  information: "border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100",
  maintenance: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  critical: "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-100",
};

export function AnnouncementBanner({ announcements }: { announcements: CustomerAnnouncement[] }) {
  if (announcements.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3 md:px-6">
      {announcements.map((a) => (
        <div key={a.id} role={a.type === "critical" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${TONE[a.type]}`}>
          <span className="font-medium">{a.title}</span>
          <span className="opacity-80"> — {a.message}</span>
        </div>
      ))}
    </div>
  );
}
