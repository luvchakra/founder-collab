import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganization, type ConsoleBusiness, type ConsoleOrganization } from "@cofounderai/core/admin/platform-organizations";
import { getEnvironmentStats } from "@cofounderai/core/admin/platform-environment-stats";
import { USER_BASE_SIZES, type OrganizationProfile } from "@cofounderai/core/admin/platform-organization-profile-rules";
import { listPlatformPlans } from "@cofounderai/core/admin/platform-plans";
import { ENVIRONMENT_LABEL, ORGANIZATION_ENVIRONMENTS, baseAppHost, orgUrl } from "@cofounderai/core/lib/org-address";
import { EnvironmentBadge } from "@cofounderai/core/shell/environment-badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Panel, formatWhen } from "../../billing/billing-ui";
import { StatusBadge } from "../status-badge";
import { ConsoleForm } from "../console-forms";
import {
  activateAction,
  changeAddressAction,
  createEnvironmentAction,
  removeEnvironmentAction,
  removeOrganizationAction,
  renameOrganizationAction,
  saveProfileAction,
  setEnvironmentTypeAction,
  setNotesAction,
  setPlanAction,
  suspendAction,
} from "../actions";
import { createBusinessAnnouncementAction } from "../../announcements/actions";

/**
 * PLATFORM-P1-10.10 (organization page) and PLATFORM-P1-10.11 (environment page),
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §40. An organization's id shows its
 * environments, owners, plan and details; an environment's id (or ?view=environment for the
 * organization's own) shows that one environment's counts and configuration.
 */

export const dynamic = "force-dynamic";

const FIELD = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function addressOf(slug: string) {
  return orgUrl(slug, baseAppHost()) ?? `/${slug}`;
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible className="rounded-xl border border-zinc-800 p-3">
      <CollapsibleTrigger className="w-full text-left text-sm font-medium text-zinc-200">{title}</CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function StatusControls({ business, isOrganization }: { business: ConsoleBusiness; isOrganization: boolean }) {
  if (business.status === "decommissioned") return <p className="text-sm text-zinc-400">Decommissioned. Its data is kept and nobody can sign in.</p>;
  return (
    <div className="flex flex-col gap-4">
      {business.status === "active" ? (
        <ConsoleForm key={`s-${business.status}`} action={suspendAction.bind(null, business.id)} submitLabel="Suspend" confirm="Members are signed out of its address and can't sign in." destructive>
          <Input name="reason" placeholder="Reason (required)" className={FIELD} />
        </ConsoleForm>
      ) : (
        <ConsoleForm key={`a-${business.status}`} action={activateAction.bind(null, business.id)} submitLabel="Activate">
          <p className="text-xs text-zinc-400">{business.disabledByOwner ? "Disabled by its owner." : `Suspended${business.suspensionReason ? `: ${business.suspensionReason}` : "."}`}</p>
        </ConsoleForm>
      )}
      <ConsoleForm
        key={`r-${business.status}`}
        action={(isOrganization ? removeOrganizationAction : removeEnvironmentAction).bind(null, business.id)}
        submitLabel={isOrganization ? "Remove organization" : "Remove environment"}
        confirm={isOrganization ? "Removes the organization and all its environments. Data is kept; addresses are freed." : "Decommissions this environment. Data is kept; its address is freed."}
        destructive
      />
    </div>
  );
}

function EnvironmentView({ organization, env, stats }: { organization: ConsoleOrganization; env: ConsoleBusiness; stats: Awaited<ReturnType<typeof getEnvironmentStats>> }) {
  const show = (n: number | null) => (n === null ? <span className="text-zinc-500">Unavailable</span> : n);
  const cards: [string, React.ReactNode][] = [
    ["Members", show(stats.members)],
    ["Licensed modules", show(stats.licensedModules)],
    ["Offerings", show(stats.offerings)],
    ["Parties", show(stats.parties)],
    ["Documents", show(stats.documents)],
    ["Payments", show(stats.payments)],
    ["AI runs, 30 days", show(stats.aiRuns30d)],
    ["Last activity", stats.lastActivityAt === undefined ? <span className="text-zinc-500">Unavailable</span> : stats.lastActivityAt ? formatWhen(stats.lastActivityAt) : "None recorded"],
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-3">
            <span className="text-xs text-zinc-400">{label}</span>
            <span className="text-lg font-semibold text-zinc-100">{value}</span>
          </div>
        ))}
      </div>
      <Panel title="Configuration">
        <div className="flex flex-col gap-3">
          <Fold title="Address">
            <ConsoleForm key={env.slug} action={changeAddressAction.bind(null, env.id)} submitLabel="Change address" confirm="The old address stops working at once.">
              <Input name="slug" defaultValue={env.slug} className={`${FIELD} font-mono`} />
            </ConsoleForm>
          </Fold>
          <Fold title="Environment type">
            <ConsoleForm key={env.environment} action={setEnvironmentTypeAction.bind(null, env.id)} submitLabel="Save">
              <NativeSelect name="environment" defaultValue={env.environment} className={FIELD}>
                {(["production", "development", "test", "staging", "sandbox"] as const).map((e) => (
                  <option key={e} value={e}>
                    {ENVIRONMENT_LABEL[e]}
                  </option>
                ))}
              </NativeSelect>
            </ConsoleForm>
          </Fold>
          <Fold title="Plan and limits">
            <p className="text-sm text-zinc-300">
              {env.plan}, set on the organization.{" "}
              <Link href={`/platform/organizations/${organization.id}#plan`} className="underline-offset-2 hover:underline">
                Change it there
              </Link>
              . Limit exceptions for this environment live in{" "}
              <Link href="/platform/overrides" className="underline-offset-2 hover:underline">
                Business Overrides
              </Link>
              ; feature flags are scoped globally, by plan, module or country in{" "}
              <Link href="/platform/feature-flags" className="underline-offset-2 hover:underline">
                Feature Flags
              </Link>
              .
            </p>
          </Fold>
          <Fold title="Private notes">
            <ConsoleForm key={env.notes ?? ""} action={setNotesAction.bind(null, env.id)} submitLabel="Save notes">
              <Textarea name="notes" defaultValue={env.notes ?? ""} rows={3} className={FIELD} placeholder="Only the platform team sees these." />
            </ConsoleForm>
          </Fold>
          <Fold title="Status">
            <StatusControls business={env} isOrganization={env.id === organization.id} />
          </Fold>
        </div>
      </Panel>
    </>
  );
}

function ProfileForm({ organizationId, profile }: { organizationId: string; profile: OrganizationProfile }) {
  const field = (name: keyof OrganizationProfile, label: string, type = "text") => (
    <label className="flex flex-col gap-1 text-xs text-zinc-400">
      {label}
      <Input name={name} type={type} defaultValue={profile[name] ?? ""} className={FIELD} />
    </label>
  );
  return (
    <ConsoleForm action={saveProfileAction.bind(null, organizationId)} submitLabel="Save details">
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Description
        <Textarea name="description" defaultValue={profile.description ?? ""} rows={2} className={FIELD} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {field("contactName", "Contact name")}
        {field("contactEmail", "Contact email", "text")}
        {field("contactPhone", "Contact phone")}
        {field("companyName", "Company name")}
        {field("companyEmail", "Company email", "text")}
        {field("companyPhone", "Company phone")}
        {field("industry", "Industry")}
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          User base
          <NativeSelect name="userBaseSize" defaultValue={profile.userBaseSize ?? ""} className={FIELD}>
            <option value="">Not set</option>
            {USER_BASE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </label>
        {field("country", "Country (e.g. IN)")}
      </div>
      {field("website", "Website")}
    </ConsoleForm>
  );
}

function OrganizationView({ organization, profile, plans }: { organization: ConsoleOrganization; profile: OrganizationProfile; plans: { key: string; name: string }[] }) {
  const missing = ORGANIZATION_ENVIRONMENTS.filter((e) => !organization.environments.some((x) => x.environment === e));
  return (
    <>
      <Panel title="Environments">
        <ul className="flex flex-col divide-y divide-zinc-800 text-sm">
          {organization.environments.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <EnvironmentBadge environment={e.environment} />
                {e.status === "decommissioned" ? (
                  <span className="font-mono text-xs text-zinc-500">{e.slug}</span>
                ) : (
                  <a href={addressOf(e.slug)} className="font-mono text-xs text-zinc-300 underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                    {addressOf(e.slug).replace(/^https?:\/\//, "")}
                  </a>
                )}
                <StatusBadge status={e.status} disabledByOwner={e.disabledByOwner} />
              </div>
              <Link href={`/platform/organizations/${e.id}${e.id === organization.id ? "?view=environment" : ""}`} className="text-sm text-zinc-300 underline-offset-2 hover:underline">
                Manage
              </Link>
            </li>
          ))}
        </ul>
        {organization.status === "active" && missing.length > 0 ? (
          <ConsoleForm action={createEnvironmentAction.bind(null, organization.id)} submitLabel="Add environment" className="flex flex-wrap items-end gap-2 pt-2">
            <NativeSelect name="environment" className={`${FIELD} w-40`}>
              {missing.map((e) => (
                <option key={e} value={e}>
                  {ENVIRONMENT_LABEL[e]}
                </option>
              ))}
            </NativeSelect>
          </ConsoleForm>
        ) : null}
      </Panel>

      <Panel title="Owners">
        {organization.owners.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {organization.owners.map((o) => (
              <li key={o.userId} className="text-zinc-200">
                {o.name ? `${o.name} · ` : ""}
                {o.email ? (
                  <a href={`mailto:${o.email}`} className="underline-offset-2 hover:underline">
                    {o.email}
                  </a>
                ) : (
                  "No email"
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">No active owner.</p>
        )}
      </Panel>

      <div id="plan">
        <Panel title="Plan" description="One plan for the organization and every environment.">
          <ConsoleForm key={organization.plan} action={setPlanAction.bind(null, organization.id)} submitLabel="Set plan" className="flex flex-wrap items-end gap-2">
            <NativeSelect name="plan" defaultValue={organization.plan} className={`${FIELD} w-48`}>
              {plans.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </ConsoleForm>
        </Panel>
      </div>

      <Panel title="Details">
        <div className="flex flex-col gap-3">
          <Fold title="Rename">
            <ConsoleForm key={organization.name} action={renameOrganizationAction.bind(null, organization.id)} submitLabel="Rename">
              <Input name="name" defaultValue={organization.name} className={FIELD} />
              <p className="text-xs text-zinc-500">Environments follow, e.g. &ldquo;{organization.name} (Test)&rdquo;.</p>
            </ConsoleForm>
          </Fold>
          <Fold title="Organization details">
            <ProfileForm organizationId={organization.id} profile={profile} />
          </Fold>
          <Fold title="Send a notice">
            <ConsoleForm action={createBusinessAnnouncementAction.bind(null, organization.id)} submitLabel="Publish notice">
              <p className="text-xs text-zinc-500">Shown in the app to this organization&apos;s members only, until it ends or you end it.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <NativeSelect name="type" defaultValue="information" className={FIELD}>
                  <option value="information">Information</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </NativeSelect>
                <Input name="expireAt" type="datetime-local" className={FIELD} aria-label="Ends (optional)" />
              </div>
              <Input name="title" placeholder="Title" className={FIELD} />
              <Textarea name="message" placeholder="Message" rows={2} className={FIELD} />
              <Input name="reason" placeholder="Reason (required, for the record)" className={FIELD} />
            </ConsoleForm>
          </Fold>
        </div>
      </Panel>
    </>
  );
}

export default async function OrganizationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const found = await getOrganization(id);
  if (!found) notFound();
  const { organization, selected, profile } = found;
  const environmentView = selected.id !== organization.id || (await searchParams).view === "environment";

  if (environmentView) {
    const stats = await getEnvironmentStats(selected.id);
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Link href={`/platform/organizations/${organization.id}`} className="text-xs text-zinc-400 hover:text-zinc-200">
            ← {organization.name}
          </Link>
          <span className="text-xs uppercase tracking-wide text-zinc-500">Environment</span>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {organization.name} · {ENVIRONMENT_LABEL[selected.environment]}
            </h1>
            <EnvironmentBadge environment={selected.environment} />
            <StatusBadge status={selected.status} disabledByOwner={selected.disabledByOwner} />
          </div>
          <span className="font-mono text-xs text-zinc-400">{addressOf(selected.slug).replace(/^https?:\/\//, "")}</span>
        </div>
        <EnvironmentView organization={organization} env={selected} stats={stats} />
      </div>
    );
  }

  const plans = (await listPlatformPlans()).map((p) => ({ key: p.key, name: p.name }));
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/platform/organizations" className="text-xs text-zinc-400 hover:text-zinc-200">
          ← Organizations
        </Link>
        <span className="text-xs uppercase tracking-wide text-zinc-500">Organization</span>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{organization.name}</h1>
          <StatusBadge status={organization.status} disabledByOwner={organization.disabledByOwner} />
        </div>
        <p className="text-sm text-zinc-400">{profile.description ?? `${organization.environments.length} environment${organization.environments.length === 1 ? "" : "s"}`}</p>
      </div>
      <OrganizationView organization={organization} profile={profile} plans={plans} />
    </div>
  );
}
