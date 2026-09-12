import { listEmailTemplates } from "@cofounderai/core/admin/platform-email-templates";
import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { EmailTemplateDialog } from "./email-template-dialog";

/**
 * PLATFORM-P0-11.2 ("System Email Templates", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §15) -- CONFIG-ONLY. See `platform-email-templates.ts` and this feature's migration for
 * the entity-ownership reasoning (genuinely distinct from `core.message_templates`, which
 * is a business's own, freely-named templates for messaging its own customers) and for why
 * nothing renders any of these yet.
 *
 * A fixed, seven-row catalog -- no Add/Delete, only Edit per row (the doc names exactly
 * seven purposes, no open-ended list). Desktop table / mobile card split per CLAUDE.md
 * development principle #12 and docs/design/claude-ui-design-rules.md rule 5, mirroring
 * `/platform/plans`' own established split, since this page's primary content is a table of
 * several rows (unlike `/platform/email-provider`'s single settings row).
 */
export default async function PlatformEmailTemplatesPage() {
  const templates = await listEmailTemplates();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">System Email Templates</h1>
        <p className="text-sm text-zinc-400">
          Configuration only -- no real email currently renders these. Every change is recorded with a reason.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800">
        <ul className="divide-y divide-zinc-800 md:hidden">
          {templates.map((template) => (
            <li key={template.templateKey} className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{template.label}</p>
                <ConfiguredBadge configured={Boolean(template.subject || template.body)} />
              </div>
              <p className="truncate text-xs text-zinc-400">{template.subject ?? "No subject configured"}</p>
              <div>
                <EmailTemplateDialog template={template} />
              </div>
            </li>
          ))}
        </ul>

        <Table className="hidden md:table">
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Template</TableHead>
              <TableHead className="text-zinc-400">Subject</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-right text-zinc-400">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TableRow key={template.templateKey} className="border-zinc-800 hover:bg-zinc-900/60">
                <TableCell className="text-zinc-100">{template.label}</TableCell>
                <TableCell className="max-w-xs truncate text-zinc-300">{template.subject ?? "No subject configured"}</TableCell>
                <TableCell>
                  <ConfiguredBadge configured={Boolean(template.subject || template.body)} />
                </TableCell>
                <TableCell className="text-right">
                  <EmailTemplateDialog template={template} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge>Configured</Badge>
  ) : (
    <Badge variant="outline" className="border-zinc-700 text-zinc-300">
      Not configured
    </Badge>
  );
}
