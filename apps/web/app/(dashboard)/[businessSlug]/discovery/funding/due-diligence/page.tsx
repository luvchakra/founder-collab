import Link from "next/link";
import { FileSearch } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { listDiligence, listInvestors, listRounds } from "@cofounderai/module-discovery/lib/funding/queries";
import { DILIGENCE_STATUSES, DILIGENCE_STATUS_LABEL, type DiligenceStatus } from "@cofounderai/module-discovery/lib/funding/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { UrlSelect } from "@cofounderai/module-discovery/components/marketing/url-select";
import { DiligenceBadge } from "@cofounderai/module-discovery/components/funding/status";
import { createDiligenceAction } from "../actions";
import { fundingContext } from "../context";

/** FND-13 — the diligence queue (§30.2): each investor request, who owes it, when, and
 * where it stands. Accepting and closing are reserved for approvers. */
export default async function DiligencePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, root, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;
  const status = (DILIGENCE_STATUSES as readonly string[]).includes(String(sp.status))
    ? (sp.status as DiligenceStatus)
    : sp.status === "all"
      ? undefined
      : "active";
  const [items, investors, rounds] = await Promise.all([listDiligence(businessId, status), listInvestors(businessId), listRounds(businessId)]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Due diligence" description="Investor requests, your responses and the evidence behind them." />
      <div className="max-w-xs">
        <UrlSelect
          name="status"
          label="Show"
          value={typeof sp.status === "string" ? sp.status : "active"}
          options={[
            { value: "active", label: "Open work" },
            { value: "all", label: "Everything" },
            ...DILIGENCE_STATUSES.map((s) => ({ value: s, label: DILIGENCE_STATUS_LABEL[s] })),
          ]}
        />
      </div>
      <Card>
        <CardContent className="pt-6">
          {items.length === 0 ? (
            <EmptyState icon={FileSearch} message="No requests here." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request</TableHead>
                      <TableHead>Investor</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Evidence</TableHead>
                      <TableHead>Last update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="max-w-72 truncate font-medium">
                          <Link href={`${root}/due-diligence/${d.id}`} className="hover:underline">
                            {d.request}
                          </Link>
                        </TableCell>
                        <TableCell>{d.investorName ?? d.requester ?? "—"}</TableCell>
                        <TableCell className={d.dueAt && d.dueAt < today && d.status !== "accepted" && d.status !== "closed" ? "font-medium text-destructive" : ""}>
                          {d.dueAt ?? "—"}
                        </TableCell>
                        <TableCell>
                          <DiligenceBadge status={d.status} />
                        </TableCell>
                        <TableCell>{d.dataRoomItemIds.length || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{d.updatedAt.slice(0, 10)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="flex flex-col gap-3 md:hidden">
                {items.map((d) => (
                  <li key={d.id}>
                    <Link href={`${root}/due-diligence/${d.id}`} className="block rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 font-medium">{d.request}</p>
                        <DiligenceBadge status={d.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {d.investorName ?? d.requester ?? "—"}
                        {d.dueAt ? ` · due ${d.dueAt}` : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Log a request</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createDiligenceAction.bind(null, businessId)} submitLabel="Add request" resetOnSuccess>
              <Field label="Request" htmlFor="dd-request">
                <Textarea id="dd-request" name="request" rows={3} required />
              </Field>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Investor" htmlFor="dd-investor">
                  <NativeSelect id="dd-investor" name="investorId" defaultValue="">
                    <option value="">—</option>
                    {investors.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Requested by" htmlFor="dd-requester">
                  <Input id="dd-requester" name="requester" />
                </Field>
                <Field label="Round" htmlFor="dd-round">
                  <NativeSelect id="dd-round" name="roundId" defaultValue={rounds[0]?.id ?? ""}>
                    <option value="">—</option>
                    {rounds.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Due" htmlFor="dd-due">
                  <Input id="dd-due" name="dueAt" type="date" />
                </Field>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
