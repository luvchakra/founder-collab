import { getMyManagedOrganizations, type ManagedBusiness, type ManagedOrganization } from "@cofounderai/core/businesses/manage-organizations";
import { ENVIRONMENT_LABEL, ORGANIZATION_ENVIRONMENTS, orgUrl } from "@cofounderai/core/lib/org-address";
import { ENVIRONMENT_COLOR, EnvironmentBadge } from "@cofounderai/core/shell/environment-badge";
import { Badge } from "@cofounderai/core/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { Input } from "@cofounderai/core/ui/input";
import { getRequestHost } from "@/lib/org-host";
import { OwnerForm } from "./manage-forms";
import { NewOrganizationButton } from "./new-organization-button";
import { orderEnvironmentAction, renameAction, setDisabledAction } from "./actions";

/**
 * PLATFORM-P1-10.8 (Manage Organizations) and PLATFORM-P1-10.9 (Paid Environments),
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §40. The organizations the signed-in person
 * owns -- disabled ones included, so they can switch them back on -- with each environment's
 * address. One action per row (Disable / Enable); rename and adding an environment are folded.
 */

export const dynamic = "force-dynamic";

function Toggle({ business, organizationOff }: { business: ManagedBusiness; organizationOff: boolean }) {
  if (business.status === "suspended" && !business.disabledByOwner) {
    return <span className="text-xs text-muted-foreground">Suspended by WonderArk</span>;
  }
  if (organizationOff && business.parentId) return null;
  const disabled = business.status === "suspended";
  return (
    <OwnerForm
      key={`${business.id}-${business.status}`}
      action={setDisabledAction.bind(null, business.id, !disabled)}
      submitLabel={disabled ? "Enable" : "Disable"}
      confirm={disabled ? undefined : business.parentId ? "Nobody can use this environment until you enable it." : "Nobody can use the organization or its environments until you enable it."}
      variant="outline"
    />
  );
}

async function OrganizationCard({ organization }: { organization: ManagedOrganization }) {
  const { base, protocol, port } = await getRequestHost();
  const organizationOff = organization.status !== "active";
  const missing = ORGANIZATION_ENVIRONMENTS.filter((e) => !organization.environments.some((x) => x.environment === e));
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{organization.name}</h2>
          {organizationOff ? <Badge variant="secondary">Disabled</Badge> : null}
        </div>
        <Toggle business={organization} organizationOff={false} />
      </div>
      <ul className="flex flex-col divide-y text-sm">
        {organization.environments.map((e) => {
          const url = orgUrl(e.slug, base, protocol, port);
          return (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <EnvironmentBadge environment={e.environment} />
                {e.status === "active" ? (
                  <a href={url ? `${url}/login` : `/${e.slug}`} className="font-mono text-xs underline-offset-2 hover:underline">
                    {url ? url.replace(/^https?:\/\//, "") : `/${e.slug}`}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-muted-foreground">{e.slug}</span>
                )}
                {e.id !== organization.id && e.status !== "active" ? <Badge variant="secondary">Disabled</Badge> : null}
              </div>
              {e.id !== organization.id ? <Toggle business={e} organizationOff={organizationOff} /> : null}
            </li>
          );
        })}
      </ul>
      <Collapsible>
        <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">Rename</CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <OwnerForm key={organization.name} action={renameAction.bind(null, organization.id)} submitLabel="Rename">
            <Input name="name" defaultValue={organization.name} minLength={2} maxLength={80} />
            <p className="text-xs text-muted-foreground">Its environments follow, e.g. &ldquo;{organization.name} (Test)&rdquo;.</p>
          </OwnerForm>
        </CollapsibleContent>
      </Collapsible>
      {!organizationOff && missing.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">Add an environment</CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <OwnerForm action={orderEnvironmentAction.bind(null, organization.id)} submitLabel="Pay and set up">
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Environment</legend>
                {missing.map((e, i) => (
                  <label key={e} className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm has-[:checked]:border-primary">
                    <input type="radio" name="environment" value={e} defaultChecked={i === 0} className="sr-only" />
                    <span className={`size-2 rounded-full ${ENVIRONMENT_COLOR[e].dot}`} aria-hidden="true" />
                    {ENVIRONMENT_LABEL[e]}
                  </label>
                ))}
              </fieldset>
              <p className="text-xs text-muted-foreground">Test payment: no money is charged. It gets its own address, data and members.</p>
            </OwnerForm>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  );
}

export default async function ManageOrganizationsPage() {
  const organizations = await getMyManagedOrganizations();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Manage organizations</h1>
          <p className="text-sm text-muted-foreground">The organizations you own, with each environment&apos;s address.</p>
        </div>
        <NewOrganizationButton />
      </div>
      {organizations.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          You don&apos;t own an organization yet. Create one, or ask an owner to manage theirs.
        </p>
      ) : (
        organizations.map((o) => <OrganizationCard key={o.id} organization={o} />)
      )}
    </div>
  );
}
