import {
  isAnnouncementActive,
  listAnnouncementFormOptions,
  listAnnouncements,
  type Announcement,
} from "@cofounderai/core/admin/platform-announcements";
import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { AnnouncementDialog } from "./announcement-dialog";
import { DeleteAnnouncementDialog } from "./delete-announcement-dialog";

/**
 * PLATFORM-P0-15.1/15.2/15.3/15.4 ("Global Announcements / Maintenance",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §19) -- the platform-wide announcement
 * catalog: type, audience targeting, a publish/expire schedule, and (for maintenance-type
 * announcements) a maintenance window plus affected modules. Config-only -- see
 * `platform-announcements.ts` and its migration's own docstrings for why this is distinct
 * from `platform.email_templates`'s delivery template and `platform.modules.status`'s own
 * per-module maintenance access-control state, and for why no customer-facing
 * banner/notice component or email delivery is built this story.
 *
 * Desktop table / mobile card split per CLAUDE.md development principle #12 and
 * docs/design/claude-ui-design-rules.md rule 5, mirroring `feature-flags/page.tsx`'s own
 * established split.
 */
export default async function PlatformAnnouncementsPage() {
  const [announcements, options] = await Promise.all([listAnnouncements(), listAnnouncementFormOptions()]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Announcements</h1>
          <p className="text-sm text-zinc-400">
            Platform-wide banners and notices. No email or in-app delivery is wired up yet -- this only manages the
            catalog.
          </p>
        </div>
        <AnnouncementDialog options={options} />
      </div>

      <div className="rounded-2xl border border-zinc-800">
        {announcements.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No announcements yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-800 md:hidden">
              {announcements.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-zinc-500">{typeLabel(a.type)}</p>
                    </div>
                    <StatusBadge announcement={a} />
                  </div>
                  <p className="text-xs text-zinc-400">{audienceLabel(a)}</p>
                  {windowLabel(a) ? <p className="text-xs text-zinc-400">Window: {windowLabel(a)}</p> : null}
                  <div className="flex items-center gap-1">
                    <AnnouncementDialog announcement={a} options={options} />
                    <DeleteAnnouncementDialog id={a.id} title={a.title} />
                  </div>
                </li>
              ))}
            </ul>

            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Announcement</TableHead>
                  <TableHead className="text-zinc-400">Audience</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-zinc-400">Window</TableHead>
                  <TableHead className="text-right text-zinc-400">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements.map((a) => (
                  <TableRow key={a.id} className="border-zinc-800 hover:bg-zinc-900/60">
                    <TableCell className="text-zinc-100">
                      <p className="font-medium">{a.title}</p>
                      <p className="text-xs text-zinc-500">{typeLabel(a.type)}</p>
                    </TableCell>
                    <TableCell className="text-zinc-300">{audienceLabel(a)}</TableCell>
                    <TableCell>
                      <StatusBadge announcement={a} />
                    </TableCell>
                    <TableCell className="text-zinc-300">{windowLabel(a) ?? "Always"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <AnnouncementDialog announcement={a} options={options} />
                        <DeleteAnnouncementDialog id={a.id} title={a.title} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}

function typeLabel(type: Announcement["type"]): string {
  return { information: "Information", warning: "Warning", maintenance: "Maintenance", critical: "Critical" }[type];
}

function audienceLabel(a: Announcement): string {
  if (a.audienceType === "specific_plan") return `Plan -- ${a.audiencePlan?.name ?? "?"}`;
  if (a.audienceType === "specific_country") return `Country -- ${a.audienceCountryCode ?? "?"}`;
  return a.audienceType === "all_users" ? "All users" : "All customers";
}

function windowLabel(a: Announcement): string | null {
  if (!a.publishAt && !a.expireAt) return null;
  const from = a.publishAt ? new Date(a.publishAt).toLocaleString() : "now";
  const to = a.expireAt ? new Date(a.expireAt).toLocaleString() : "indefinitely";
  return `${from} -> ${to}`;
}

function StatusBadge({ announcement }: { announcement: Announcement }) {
  if (!announcement.enabled) return <Badge variant="destructive">Disabled</Badge>;
  if (isAnnouncementActive(announcement)) return <Badge>Active</Badge>;
  const now = new Date();
  if (announcement.publishAt && now < new Date(announcement.publishAt)) return <Badge variant="secondary">Scheduled</Badge>;
  return <Badge variant="secondary">Expired</Badge>;
}
