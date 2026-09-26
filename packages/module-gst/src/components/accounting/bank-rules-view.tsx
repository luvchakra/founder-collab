"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { RULE_DIRECTION_LABEL, type RuleDirection } from "../../lib/accounting/bank-rules";
import type { BankRuleRow } from "../../lib/accounting/bank-rule-queries";
import { ledgerAmount } from "./labels";

export type BankRuleActionState = { error: string } | { success: true } | null;

export interface RuleAccountOption {
  id: string;
  label: string;
}

function amountRange(rule: BankRuleRow): string {
  if (rule.minAmount === null && rule.maxAmount === null) return "Any amount";
  if (rule.minAmount !== null && rule.maxAmount !== null) {
    return `${ledgerAmount.format(rule.minAmount)} – ${ledgerAmount.format(rule.maxAmount)}`;
  }
  return rule.minAmount !== null ? `From ${ledgerAmount.format(rule.minAmount)}` : `Up to ${ledgerAmount.format(rule.maxAmount!)}`;
}

/**
 * FIN-8: the rules that categorise bank lines, in the order they are tried.
 *
 * One form for adding and editing — the row's Edit fills it in — kept on the page rather
 * than in a modal because a rule is a handful of fields someone tunes while looking at the
 * list above it ("this one should come before that one").
 */
export function BankRulesView({
  rules,
  accounts,
  parties,
  canManage,
  saveAction,
  setActiveAction,
  deleteAction,
}: {
  rules: BankRuleRow[];
  accounts: RuleAccountOption[];
  parties: RuleAccountOption[];
  canManage: boolean;
  /** Creates when `rule_id` is empty, updates otherwise. */
  saveAction: (prev: BankRuleActionState, formData: FormData) => Promise<BankRuleActionState>;
  setActiveAction: (ruleId: string, isActive: boolean) => Promise<void>;
  deleteAction: (ruleId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<BankRuleRow | "new" | null>(rules.length === 0 && canManage ? "new" : null);

  return (
    <div className="flex flex-col gap-4">
      {canManage && editing === null ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden="true" />
            New rule
          </Button>
        </div>
      ) : null}

      {canManage && editing !== null ? (
        <RuleForm
          key={editing === "new" ? "new" : editing.id}
          rule={editing === "new" ? null : editing}
          accounts={accounts}
          parties={parties}
          action={saveAction}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {rules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <Wand2 className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">
            No rules yet. A rule remembers where a kind of bank line goes — &ldquo;anything mentioning AWS is Software&rdquo; —
            so next month&apos;s statement suggests it for you.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-1.5 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">
                      {rule.name}
                      {rule.isActive ? null : <Badge variant="outline" className="ml-2">Paused</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground break-words">
                      Contains &ldquo;{rule.matchText}&rdquo; · {RULE_DIRECTION_LABEL[rule.direction]} · {amountRange(rule)}
                    </p>
                    <p className="text-xs">→ {rule.accountLabel}{rule.partyName ? ` · ${rule.partyName}` : ""}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">#{rule.priority}</span>
                </div>
                {canManage ? <RowActions rule={rule} onEdit={() => setEditing(rule)} setActiveAction={setActiveAction} deleteAction={deleteAction} /> : null}
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Order</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>When a line</TableHead>
                <TableHead>Post to</TableHead>
                {canManage ? <TableHead className="w-44 text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} className={rule.isActive ? undefined : "opacity-60"}>
                  <TableCell className="text-muted-foreground tabular-nums">{rule.priority}</TableCell>
                  <TableCell className="font-medium">
                    {rule.name}
                    {rule.isActive ? null : <Badge variant="outline" className="ml-2">Paused</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    contains &ldquo;{rule.matchText}&rdquo;
                    <span className="block text-xs">{RULE_DIRECTION_LABEL[rule.direction]} · {amountRange(rule)}</span>
                  </TableCell>
                  <TableCell>
                    {rule.accountLabel}
                    {rule.partyName ? <span className="block text-xs text-muted-foreground">{rule.partyName}</span> : null}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <RowActions rule={rule} onEdit={() => setEditing(rule)} setActiveAction={setActiveAction} deleteAction={deleteAction} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function RowActions({
  rule,
  onEdit,
  setActiveAction,
  deleteAction,
}: {
  rule: BankRuleRow;
  onEdit: () => void;
  setActiveAction: (ruleId: string, isActive: boolean) => Promise<void>;
  deleteAction: (ruleId: string) => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${rule.name}`}>
        <Pencil className="size-4" aria-hidden="true" />
      </Button>
      <form action={setActiveAction.bind(null, rule.id, !rule.isActive)}>
        <SubmitButton variant="ghost" size="sm">
          {rule.isActive ? "Pause" : "Resume"}
        </SubmitButton>
      </form>
      <form action={deleteAction.bind(null, rule.id)}>
        <SubmitButton variant="ghost" size="sm" aria-label={`Delete ${rule.name}`} className="text-destructive-subtle">
          <Trash2 className="size-4" aria-hidden="true" />
        </SubmitButton>
      </form>
    </div>
  );
}

function RuleForm({
  rule,
  accounts,
  parties,
  action,
  onDone,
}: {
  rule: BankRuleRow | null;
  accounts: RuleAccountOption[];
  parties: RuleAccountOption[];
  action: (prev: BankRuleActionState, formData: FormData) => Promise<BankRuleActionState>;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState<BankRuleActionState, FormData>(action, null);
  useEffect(() => {
    if (state && "success" in state) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <input type="hidden" name="rule_id" value={rule?.id ?? ""} />
      <h2 className="text-sm font-semibold">{rule ? `Edit “${rule.name}”` : "New rule"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-name">Name</Label>
          <Input id="rule-name" name="name" required defaultValue={rule?.name ?? ""} placeholder="Cloud hosting" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-match">Description contains</Label>
          <Input id="rule-match" name="match_text" required defaultValue={rule?.matchText ?? ""} placeholder="AWS" />
          <p className="text-xs text-muted-foreground">Capitals and extra spaces don&apos;t matter.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-direction">Money</Label>
          <NativeSelect id="rule-direction" name="direction" defaultValue={rule?.direction ?? "out"}>
            {(Object.keys(RULE_DIRECTION_LABEL) as RuleDirection[]).map((d) => (
              <option key={d} value={d}>
                {RULE_DIRECTION_LABEL[d]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-min">Min amount</Label>
            <Input id="rule-min" name="min_amount" inputMode="decimal" defaultValue={rule?.minAmount ?? ""} placeholder="Any" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-max">Max amount</Label>
            <Input id="rule-max" name="max_amount" inputMode="decimal" defaultValue={rule?.maxAmount ?? ""} placeholder="Any" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-account">Post to account</Label>
          <NativeSelect id="rule-account" name="account_id" required defaultValue={rule?.accountId ?? ""}>
            <option value="">Choose an account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-party">Supplier or customer (optional)</Label>
          <NativeSelect id="rule-party" name="party_id" defaultValue={rule?.partyId ?? ""}>
            <option value="">None</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-priority">Order</Label>
          <Input id="rule-priority" name="priority" inputMode="numeric" defaultValue={rule?.priority ?? 100} />
          <p className="text-xs text-muted-foreground">Lower is tried first when two rules fit the same line.</p>
        </div>
      </div>

      {state && "error" in state ? (
        <p role="alert" className="text-sm text-destructive-subtle">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pendingText="Saving...">{rule ? "Save changes" : "Add rule"}</SubmitButton>
      </div>
    </form>
  );
}
