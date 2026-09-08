"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Switch } from "@cofounderai/core/ui/switch";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cofounderai/core/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { JobChargeType } from "../../lib/job-charge-types/types";
import type { NumberSequenceRow } from "../../lib/numbering/types";
import type { ServiceType } from "../../lib/service-types/types";
import type { FsmSettings, UpdateFsmSettingsInput } from "../../lib/settings/types";

function NamedTypeTab<T extends { id: string; name: string; is_active: boolean }>({
  items,
  extraField,
  createAction,
  updateAction,
  setActiveAction,
}: {
  items: T[];
  extraField?: (item: T) => string | null;
  createAction: (name: string, description?: string) => Promise<void>;
  updateAction: (id: string, name: string, description?: string) => Promise<void>;
  setActiveAction: (id: string, isActive: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

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

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await createAction(newName);
            setNewName("");
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-name">New</Label>
          <Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          Add
        </Button>
      </form>

      <Table>
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
                  <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="h-8 max-w-xs" />
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
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          await updateAction(item.id, editingName);
                          setEditingId(null);
                        })
                      }
                    >
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditingName(item.name);
                      }}
                    >
                      Rename
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
    <Tabs defaultValue="document">
      <TabsList>
        <TabsTrigger value="document">Document & reminders</TabsTrigger>
        <TabsTrigger value="service-types">Service types</TabsTrigger>
        <TabsTrigger value="charge-types">Job charge types</TabsTrigger>
        <TabsTrigger value="numbering">Numbering</TabsTrigger>
      </TabsList>

      <TabsContent value="document" className="flex flex-col gap-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

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
            <Label htmlFor="reminder-lead">Customer reminder lead time (hours)</Label>
            <Input id="reminder-lead" type="number" value={reminderLeadHours} onChange={(e) => setReminderLeadHours(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="arrival-window">Default arrival window (minutes)</Label>
            <Input id="arrival-window" type="number" value={arrivalWindowMinutes} onChange={(e) => setArrivalWindowMinutes(e.target.value)} required />
          </div>
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

        <div>
          <Button onClick={saveSettings} disabled={pending}>
            {pending ? "Saving..." : "Save settings"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Message templates and company logo/document footer aren&apos;t configurable yet -- message templates need `core.messages`/
          `core.message_templates` (not built until a later story); logo/footer need a document-branding upload feature this platform
          doesn&apos;t have yet either.
        </p>
      </TabsContent>

      <TabsContent value="service-types">
        <NamedTypeTab
          items={serviceTypes}
          extraField={(s) => s.description}
          createAction={createServiceTypeAction}
          updateAction={updateServiceTypeAction}
          setActiveAction={setServiceTypeActiveAction}
        />
      </TabsContent>

      <TabsContent value="charge-types">
        <NamedTypeTab
          items={jobChargeTypes}
          createAction={createJobChargeTypeAction}
          updateAction={updateJobChargeTypeAction}
          setActiveAction={setJobChargeTypeActiveAction}
        />
      </TabsContent>

      <TabsContent value="numbering">
        {numberSequences.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            No numbers minted yet this fiscal year.
          </p>
        ) : (
          <Table>
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
        )}
        <p className="mt-3 text-xs text-muted-foreground">Read-only -- numbers are minted automatically and can&apos;t be edited here.</p>
      </TabsContent>
    </Tabs>
  );
}
