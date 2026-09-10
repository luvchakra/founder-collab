"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Switch } from "@cofounderai/core/ui/switch";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cofounderai/core/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { JobChargeType } from "../../lib/job-charge-types/types";
import type { NumberSequenceRow } from "../../lib/numbering/types";
import type { ServiceType } from "../../lib/service-types/types";
import type { FsmSettings, UpdateFsmSettingsInput } from "../../lib/settings/types";

/**
 * Service types / job charge types tab -- a small CRUD list, so unlike the Reports
 * page's aggregate rows, every row here really is one editable entity. `hasDescription`
 * (only true for service types, which are the only one of the two with a description
 * column) also switches on a description field in both the "Add new" form and each row's
 * inline edit mode -- previously only the name was ever editable, even though the
 * server actions already accepted a description.
 */
function NamedTypeTab<T extends { id: string; name: string; is_active: boolean }>({
  items,
  hasDescription,
  extraField,
  createAction,
  updateAction,
  setActiveAction,
}: {
  items: T[];
  hasDescription?: boolean;
  extraField?: (item: T) => string | null;
  createAction: (name: string, description?: string) => Promise<void>;
  updateAction: (id: string, name: string, description?: string) => Promise<void>;
  setActiveAction: (id: string, isActive: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  const activeCount = items.filter((i) => i.is_active).length;

  function startEditing(item: T) {
    setEditingId(item.id);
    setEditingName(item.name);
    setEditingDescription(extraField?.(item) ?? "");
  }

  function saveEditing(id: string) {
    run(async () => {
      await updateAction(id, editingName, hasDescription ? editingDescription : undefined);
      setEditingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{items.length}</Badge>
        {items.length === 1 ? "type" : "types"}
        {items.length > 0 ? <span>· {activeCount} active</span> : null}
      </div>

      <form
        className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-3 sm:flex-row sm:items-end sm:flex-wrap"
        action={async () => {
          setError(null);
          try {
            await createAction(newName, hasDescription ? newDescription : undefined);
            setNewName("");
            setNewDescription("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
          }
        }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="new-name">New name</Label>
          <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </div>
        {hasDescription ? (
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="new-description">Description (optional)</Label>
            <Input id="new-description" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
          </div>
        ) : null}
        <SubmitButton size="sm" pendingText="Adding..." className="sm:self-end">
          Add
        </SubmitButton>
      </form>

      {items.length === 0 ? (
        <EmptyState variant="inline" message="None yet -- add one above." />
      ) : (
        <div className="rounded-lg border border-border">
          {/* Compact cards below md (CLAUDE.md rule #12) -- the plain <Table> here had no
              mobile treatment at all before, and four columns of buttons plus a name cell
              is exactly the kind of row that gets cramped/truncated on a phone. */}
          <ul className="divide-y md:hidden">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 p-3">
                {editingId === item.id ? (
                  <div className="flex flex-col gap-2">
                    <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} placeholder="Name" />
                    {hasDescription ? (
                      <Input
                        value={editingDescription}
                        onChange={(e) => setEditingDescription(e.target.value)}
                        placeholder="Description (optional)"
                      />
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" disabled={pending} onClick={() => saveEditing(item.id)}>
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        {extraField?.(item) ? (
                          <p className="text-xs text-muted-foreground">{extraField(item)}</p>
                        ) : null}
                      </div>
                      <Badge variant={item.is_active ? "secondary" : "outline"} className="shrink-0">
                        {item.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => startEditing(item)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setActiveAction(item.id, !item.is_active))}>
                        {item.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {editingId === item.id ? (
                      <div className="flex flex-col gap-1.5 py-1">
                        <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-8 max-w-xs" placeholder="Name" />
                        {hasDescription ? (
                          <Input
                            value={editingDescription}
                            onChange={(e) => setEditingDescription(e.target.value)}
                            className="h-8 max-w-xs"
                            placeholder="Description (optional)"
                          />
                        ) : null}
                      </div>
                    ) : (
                      <>
                        {item.name}
                        {extraField?.(item) ? <p className="text-xs text-muted-foreground">{extraField(item)}</p> : null}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.is_active ? "secondary" : "outline"}>{item.is_active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    {editingId === item.id ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                        <Button size="sm" disabled={pending} onClick={() => saveEditing(item.id)}>
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => startEditing(item)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setActiveAction(item.id, !item.is_active))}>
                          {item.is_active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function SettingsView({
  serviceTypes,
  jobChargeTypes,
  settings,
  numberSequences,
  createServiceTypeAction,
  updateServiceTypeAction,
  setServiceTypeActiveAction,
  createJobChargeTypeAction,
  updateJobChargeTypeAction,
  setJobChargeTypeActiveAction,
  updateSettingsAction,
}: {
  serviceTypes: ServiceType[];
  jobChargeTypes: JobChargeType[];
  settings: FsmSettings;
  numberSequences: NumberSequenceRow[];
  createServiceTypeAction: (name: string, description?: string) => Promise<void>;
  updateServiceTypeAction: (id: string, name: string, description?: string) => Promise<void>;
  setServiceTypeActiveAction: (id: string, isActive: boolean) => Promise<void>;
  createJobChargeTypeAction: (name: string) => Promise<void>;
  updateJobChargeTypeAction: (id: string, name: string) => Promise<void>;
  setJobChargeTypeActiveAction: (id: string, isActive: boolean) => Promise<void>;
  updateSettingsAction: (input: UpdateFsmSettingsInput) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [defaultTerms, setDefaultTerms] = useState(settings.default_terms ?? "");
  const [estimateExpiryDays, setEstimateExpiryDays] = useState(settings.estimate_expiry_days?.toString() ?? "");
  const [reminderLeadHours, setReminderLeadHours] = useState(settings.reminder_lead_hours.toString());
  const [arrivalWindowMinutes, setArrivalWindowMinutes] = useState(settings.arrival_window_minutes.toString());
  const [autoInvoice, setAutoInvoice] = useState(settings.auto_invoice_on_complete);
  const [centerEnabled, setCenterEnabled] = useState(settings.customer_center_enabled);
  const [contactFormEnabled, setContactFormEnabled] = useState(settings.contact_form_enabled);

  const saveSettings = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await updateSettingsAction({
          default_terms: defaultTerms.trim() || null,
          estimate_expiry_days: estimateExpiryDays ? Number(estimateExpiryDays) : null,
          reminder_lead_hours: Number(reminderLeadHours),
          arrival_window_minutes: Number(arrivalWindowMinutes),
          auto_invoice_on_complete: autoInvoice,
          customer_center_enabled: centerEnabled,
          contact_form_enabled: contactFormEnabled,
        });
        setNotice("Settings saved.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-5">
      <Tabs defaultValue="document">
        {/* Single horizontally-scrollable row (each trigger `shrink-0`) instead of
            TabsList's default `inline-flex` -- with the base component's fixed `h-9`,
            four triggers plus this strip's own padding didn't fit one screen width on a
            phone, so the last tab ("Job charge types") was simply clipped off the right
            edge with no way to reach it. Same fix already applied to the Reports page's
            own 10-tab strip. */}
        <TabsList className="flex w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="document" className="shrink-0">Document & reminders</TabsTrigger>
          <TabsTrigger value="service-types" className="shrink-0">Service types</TabsTrigger>
          <TabsTrigger value="charge-types" className="shrink-0">Job charge types</TabsTrigger>
          <TabsTrigger value="numbering" className="shrink-0">Numbering</TabsTrigger>
        </TabsList>

        <TabsContent value="document" className="flex flex-col gap-6 pt-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium">Estimates & invoices</h3>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="default-terms">Default terms (shown on estimates and invoices)</Label>
              <Textarea id="default-terms" value={defaultTerms} onChange={(e) => setDefaultTerms(e.target.value)} rows={4} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="estimate-expiry">Estimate expiry (days, blank = never)</Label>
                <Input id="estimate-expiry" type="number" value={estimateExpiryDays} onChange={(e) => setEstimateExpiryDays(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="arrival-window">Default arrival window (minutes)</Label>
                <Input id="arrival-window" type="number" value={arrivalWindowMinutes} onChange={(e) => setArrivalWindowMinutes(e.target.value)} required />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium">Reminders & customer-facing features</h3>
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="reminder-lead">Customer reminder lead time (hours)</Label>
              <Input id="reminder-lead" type="number" value={reminderLeadHours} onChange={(e) => setReminderLeadHours(e.target.value)} required />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={autoInvoice} onCheckedChange={setAutoInvoice} />
              Auto-generate an invoice when a job is completed
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={centerEnabled} onCheckedChange={setCenterEnabled} />
              Enable Customer Center (tokenised customer self-serve portal)
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={contactFormEnabled} onCheckedChange={setContactFormEnabled} />
              Enable the public contact/request-service form
            </label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={saveSettings} disabled={pending} className="w-full sm:w-auto">
              {pending ? "Saving..." : "Save settings"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Message templates and company logo/document footer aren&apos;t configurable yet -- message templates need `core.messages`/
            `core.message_templates` (not built until a later story); logo/footer need a document-branding upload feature this platform
            doesn&apos;t have yet either.
          </p>
        </TabsContent>

        <TabsContent value="service-types" className="pt-4">
          <NamedTypeTab
            items={serviceTypes}
            hasDescription
            extraField={(s) => s.description}
            createAction={createServiceTypeAction}
            updateAction={updateServiceTypeAction}
            setActiveAction={setServiceTypeActiveAction}
          />
        </TabsContent>

        <TabsContent value="charge-types" className="pt-4">
          <NamedTypeTab
            items={jobChargeTypes}
            createAction={createJobChargeTypeAction}
            updateAction={updateJobChargeTypeAction}
            setActiveAction={setJobChargeTypeActiveAction}
          />
        </TabsContent>

        <TabsContent value="numbering" className="pt-4">
          {numberSequences.length === 0 ? (
            <EmptyState variant="inline" message="No numbers minted yet this fiscal year." />
          ) : (
            <div className="rounded-lg border border-border">
              <ul className="divide-y md:hidden">
                {numberSequences.map((s) => (
                  <li key={`${s.scope}-${s.fiscal_year}`} className="flex flex-col gap-1 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{s.scope.replace("_", " ")}</span>
                      <span className="text-xs text-muted-foreground">FY {s.fiscal_year}</span>
                    </div>
                    <span className="text-muted-foreground">
                      Next: {s.prefix}/{s.fiscal_year}/{String(s.next_value).padStart(4, "0")}
                    </span>
                  </li>
                ))}
              </ul>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Fiscal year</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead className="text-right">Next number</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {numberSequences.map((s) => (
                    <TableRow key={`${s.scope}-${s.fiscal_year}`}>
                      <TableCell className="capitalize">{s.scope.replace("_", " ")}</TableCell>
                      <TableCell>{s.fiscal_year}</TableCell>
                      <TableCell>{s.prefix}</TableCell>
                      <TableCell className="text-right">
                        {s.prefix}/{s.fiscal_year}/{String(s.next_value).padStart(4, "0")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Read-only -- numbers are minted automatically and can&apos;t be edited here.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
