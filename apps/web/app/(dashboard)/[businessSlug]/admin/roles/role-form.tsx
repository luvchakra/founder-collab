"use client";
// RBAC-14 / RBAC-30 -- the permission editor: grouped by module, ceiling-aware.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Lock, Search } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { cn } from "@cofounderai/core/lib/utils";
import { isHighRiskPermission, type PermissionGroup } from "../users/access-ui";
import { createRoleAction, updateRoleAction } from "./actions";

type Base = { value: string; label: string; permissionKeys: string[]; templateKey: string | null; description: string | null };

/**
 * RBAC-27/28 (§13, §25) -- the role editor, for a new custom role and for editing one.
 * Permissions come from core.permissions, grouped by module. What the viewer doesn't
 * hold is shown but locked (§12): the database refuses to grant it anyway, this just
 * says so before they try.
 */
export function RoleForm({
  businessSlug,
  groups,
  grantable,
  mode,
  initial,
  bases = [],
  cancelHref,
}: {
  businessSlug: string;
  groups: PermissionGroup[];
  grantable: string[];
  mode: "create" | "edit";
  initial: { roleId?: string; name: string; description: string; permissionKeys: string[] };
  bases?: { group: string; options: Base[] }[];
  cancelHref: string;
}) {
  const router = useRouter();
  const canGrant = useMemo(() => new Set(grantable), [grantable]);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.permissionKeys));
  const [base, setBase] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const allBases = bases.flatMap((b) => b.options);
  const locked = groups.some((g) => g.permissions.some((p) => !canGrant.has(p.key)));

  function toggle(key: string, on: boolean) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroup, on: boolean) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (!canGrant.has(p.key)) continue;
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });
  }

  function chooseBase(value: string) {
    setBase(value);
    const chosen = allBases.find((b) => b.value === value);
    if (!chosen) {
      setSkipped(0);
      return;
    }
    const known = new Set(groups.flatMap((g) => g.permissions.map((p) => p.key)));
    const keys = chosen.permissionKeys.filter((k) => known.has(k));
    setSelected(new Set(keys.filter((k) => canGrant.has(k))));
    setSkipped(keys.filter((k) => !canGrant.has(k)).length);
    if (!description.trim() && chosen.description) setDescription(chosen.description);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { name, description, permissionKeys: [...selected].sort() };
    start(async () => {
      setError(null);
      setSaved(false);
      if (mode === "create") {
        const templateKey = allBases.find((b) => b.value === base)?.templateKey ?? null;
        const result = await createRoleAction(businessSlug, { ...payload, templateKey });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/${businessSlug}/admin/roles/${result.value?.roleId ?? ""}`);
        return;
      }
      const result = await updateRoleAction(businessSlug, initial.roleId ?? "", payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const needle = query.trim().toLowerCase();
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      shown: needle
        ? g.permissions.filter((p) => p.key.toLowerCase().includes(needle) || (p.description ?? "").toLowerCase().includes(needle) || g.label.toLowerCase().includes(needle))
        : g.permissions,
    }))
    .filter((g) => g.shown.length > 0);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-name">Role name</Label>
          <Input id="role-name" required maxLength={80} value={name} onChange={(e) => {
              setSaved(false);
              setName(e.target.value);
            }} placeholder="e.g. Operations Manager" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role-description">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea id="role-description" maxLength={500} value={description} onChange={(e) => {
              setSaved(false);
              setDescription(e.target.value);
            }} />
        </div>
        {mode === "create" && allBases.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-base">
              Start from <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <NativeSelect id="role-base" value={base} onChange={(e) => chooseBase(e.target.value)}>
              <option value="">Blank role</option>
              {bases.map((b) => (
                <optgroup key={b.group} label={b.group}>
                  {b.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Copies its permissions into this role. Later changes to the template or role don&apos;t change this one.
            </p>
            {skipped > 0 ? (
              <p className="text-xs text-warning-subtle">
                {skipped} {skipped === 1 ? "permission was" : "permissions were"} left out because you don&apos;t hold {skipped === 1 ? "it" : "them"}.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Permissions</h2>
            <p className="text-sm text-muted-foreground">
              {selected.size} selected
              {locked ? (
                <span className="ml-2 inline-flex items-center gap-1">
                  <Lock className="size-3" aria-hidden="true" /> You can only grant permissions you have
                </span>
              ) : null}
            </p>
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions…" aria-label="Search permissions" className="pl-9" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {visibleGroups.map((g) => {
            const grantableInGroup = g.permissions.filter((p) => canGrant.has(p.key));
            const selectedInGroup = g.permissions.filter((p) => selected.has(p.key)).length;
            const allOn = grantableInGroup.length > 0 && grantableInGroup.every((p) => selected.has(p.key));
            const someOn = selectedInGroup > 0;
            const isCollapsed = collapsed.has(g.module) && !needle;
            const groupId = `perm-group-${g.module}`;
            return (
              <fieldset key={g.module} className="rounded-lg border">
                <legend className="sr-only">{g.label}</legend>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Checkbox
                    id={groupId}
                    aria-label={`All ${g.label} permissions`}
                    checked={allOn ? true : someOn ? "indeterminate" : false}
                    disabled={grantableInGroup.length === 0}
                    onCheckedChange={(v) => toggleGroup(g, v === true)}
                    className="data-[state=indeterminate]:bg-primary/30 data-[state=indeterminate]:text-transparent"
                  />
                  <label htmlFor={groupId} className="flex-1 cursor-pointer text-sm font-medium">
                    {g.label}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {selectedInGroup} of {g.permissions.length}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `Show ${g.label} permissions` : `Hide ${g.label} permissions`}
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.module)) next.delete(g.module);
                        else next.add(g.module);
                        return next;
                      })
                    }
                  >
                    <ChevronDown className={cn("size-4 transition-transform", isCollapsed && "-rotate-90")} aria-hidden="true" />
                  </button>
                </div>
                {isCollapsed ? null : (
                  <ul className="flex flex-col border-t">
                    {g.shown.map((p) => {
                      const allowed = canGrant.has(p.key);
                      const id = `perm-${p.key}`;
                      return (
                        <li key={p.key} className={cn("flex items-start gap-3 px-3 py-2 pl-9", !allowed && "opacity-60")}>
                          <Checkbox id={id} checked={selected.has(p.key)} disabled={!allowed} onCheckedChange={(v) => toggle(p.key, v === true)} className="mt-0.5" />
                          <label htmlFor={id} className={cn("flex min-w-0 flex-1 flex-col gap-0.5 text-sm", allowed ? "cursor-pointer" : "cursor-not-allowed")}>
                            <span className="flex flex-wrap items-center gap-2">
                              {p.description ?? p.key}
                              {isHighRiskPermission(p.key) ? <Badge variant="warning">High risk</Badge> : null}
                            </span>
                            <code className="text-xs text-muted-foreground">{p.key}</code>
                            {!allowed ? (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Lock className="size-3" aria-hidden="true" /> You can only grant permissions you have
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </fieldset>
            );
          })}
          {visibleGroups.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No permissions match “{query}”.</p> : null}
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-success-subtle">
          Role saved.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : mode === "create" ? "Create role" : "Save role"}
        </Button>
      </div>
    </form>
  );
}
