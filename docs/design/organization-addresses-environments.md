# Organization addresses, environments and the vendor console

Brings WonderID's 2026-10-13 work (repository `luvchakra/wonder-agent`, studied read-only on
2026-10-13 at `1bcb39f`) into WonderArk, fitted to WonderArk's own model. This note records what
WonderID did, what each piece maps to here, and the decisions the owner must make before any of
it changes WonderArk's tenancy, authorization or payments (CLAUDE.md: architecture is locked).

## 1. The two models side by side

| | WonderID | WonderArk today |
|---|---|---|
| Tenant | `tenants` row (one table) | `core.businesses` (operational tenant, ADR-4); `core.accounts` is a hidden container, one per user |
| What a customer calls "organization" | top-level tenant | the **business**: it has the switcher entry, slug, licences, plan, subscription |
| Address | subdomain `<slug>.<BASE_APP_HOST>` | path `/<slug>/...` on one host (`ark.wonderapps.biz`) |
| Slug rules | `^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$`, no `--`, ~45 reserved words, editable by vendor | `^[a-z0-9]+(-[a-z0-9]+)*$`, **no length limit**, 16 reserved words, generated from the name, never editable |
| Tenant from | membership; host only picks which membership | membership via `core.user_business_ids()`; path picks which |
| Session | host-only cookies, so per address | host-only cookies, one host |
| Suspension | `tenants.status = suspended`, enforced (sign-in refused, RLS) | **none at business level**; `businesses.disabled_at` hides it from the switcher only, RLS ignores it |
| Environments | each a tenant, `platform_tenants.parent_tenant_id` (no FK) | **none** (`platform.subscriptions.environment` is the payment provider's test/live mode, unrelated) |
| Plan | one per organization, copied to environments | one per business (`business_settings.plan`, billing-guarded) |
| Vendor admin | `platform_admins` table or confirmed `PLATFORM_ADMIN_EMAILS` | `platform.admins` / `platform.is_superadmin()` or `PLATFORM_ADMIN_EMAILS`, plus MFA (AAL2) for `/platform` |
| Vendor tenant directory | Organizations list + organization + environment pages | **none**; only counts on the dashboard and a business picker in Overrides |
| Announcements | global or one tenant, optional end, End now | `platform.announcements`: all customers / all users / plan / country, `expire_at`; **no per-business audience, no End now** |
| Vendor audit | `platform_audit_logs` | `platform.audit_log` (superadmin-read, `write_platform_audit_log`) |

## 2. Mapping, piece by piece

| WonderID | WonderArk equivalent |
|---|---|
| `0095` `tenant_domains`, `resolve_tenant_host` | **new** `platform.resolve_business_host(label)`: reads `core.business_settings.slug`; no domains table until custom domains are asked for |
| `tenant_slug_is_valid`, reserved list | **extend** `business_settings_slug_format` with 3–32 length; merge WonderID's reserved words into `business_settings_slug_not_reserved` and `core.generate_business_slug()` (existing slugs checked first) |
| `0156` `platform_tenants.parent_tenant_id`, `create_tenant_environment` | **new** `platform.business_environments` (business_id PK, environment, parent_business_id **without FK**, notes): vendor-only; `platform.create_business_environment()` creates a business in the same account, copies active owners, seeds licences, inherits the plan |
| `0157` `rename_tenant_slug`, `set_tenant_environment`, `tenant_slug_available` | **new** `platform.rename_business_slug()` (vendor), `platform.set_business_environment()`, `core.business_slug_available()` |
| `0158/0159` `my_organization_environments` | **new** `core.my_business_environments()`: caller's own active memberships only |
| `0160` `remove_tenant_environment` | **new** `platform.remove_business_environment()`: decommission (data kept), slug freed |
| `0161` owner self-service, `disabled_by_owner`, `environment_orders` | **new** `core.is_organization_owner()`, `core.my_managed_organizations()`, `core.owner_rename_organization()`, `core.owner_set_organization_disabled()`; `core.businesses.suspended_at/suspension_reason/disabled_by_owner`; `platform.environment_orders` |
| `0162` `platform_organization_profiles` | **new** `platform.organization_profiles` (vendor-only, no client policies). Note: `core.businesses` already has description, website, industry; the profile adds contact, company, user base, country |
| `0163` plan backfill | not needed (no environments exist yet) |
| `0164` suffix stripping, `0165` production at bare prefix | built into `create_business_environment()` from the start |
| `lib/tenant/host.ts`, `hostTenant.ts` | **new** `packages/core/src/tenancy/host.ts` (pure) and `host-business.ts` (server) |
| `proxy.ts` host resolution, 404/503, main-address redirect | **extend** `packages/core/src/db/middleware.ts` `updateSession()` |
| `tenantAddressGate.ts`, sign-in action, `/auth/callback` | **extend** `apps/web/app/(auth)/actions.ts`, `apps/web/app/auth/callback/route.ts`; OAuth `redirectTo` uses the request origin already |
| `app/organizations/page.tsx` | **extend** `/dashboard` (WonderArk's main-address entry) |
| `app/onboarding/*` | **extend** `CreateBusinessModal` (name, prefix with live address preview, environment) |
| `app/organizations/manage/*` | **new** `/dashboard/organizations` (outside the business shell) |
| `WorkspaceSwitcher`, `environment.tsx` | **extend** `packages/core/src/components/shell/business-switcher.tsx`; new `environment-badge.tsx` |
| `app/platform-admin/tenants/*` | **new** `/platform/organizations`, `/platform/organizations/[id]` |
| `modules/platform-admin/*.ts` | **new** `packages/core/src/admin/platform-organizations.ts`, `platform-organization-profile(-rules).ts`, `platform-environment-stats.ts` |
| `announcements.ts` End now, tenant scope | **extend** `platform.announcements` with `audience_type = 'specific_business'` + `audience_business_id`, and an End now action |
| `auditLog.ts` | reuse `platform.write_platform_audit_log` (new resource types) and `core.write_audit_log` for owner actions |
| `modules/billing/environmentOrders.ts` | **new** `packages/core/src/billing/environment-orders.ts` |

## 3. Lessons carried over (WonderID bugs not to repeat)

- No FK on `parent_business_id` (PostgREST embeds go ambiguous); name embeds explicitly anyway.
- The organization is the business its environments link to, never chosen by environment rank.
- Strip `-(dev|test|staging)` before adding a suffix; production sits at the bare prefix.
- An owner reads their own disabled organization through a function that bypasses the
  suspension filter, or they can never re-enable it.
- Confirm steps are keyed by status so they reset after a change.
- The host never authorizes; a lookup failure is 503, never a fallback to another tenant.
- Only "a business exists at this label" is cached, never its data.
- Counts that can't be read show "Unavailable", never 0.

## 4. Decisions for the owner (asked 2026-10-13)

1. What is the organization: the **business** (recommended) or the account?
2. URL shape on an organization's address: keep today's path routes and gate them by host, or
   serve the product at the address root.
3. Business suspension/disable enforced in RLS (changes `core.user_business_ids()` for every
   table) — yes/no.
4. Paid environments: test payments until a provider is wired (WonderID's choice), free, or real
   checkout now.

Defaults assumed unless the owner says otherwise: nothing shared between environments (WonderID's
decision); base host `ark.wonderapps.biz`, so `acme.ark.wonderapps.biz`; prefix 3–32 characters.

## 5. Infrastructure the owner sets up (once built)

- Vercel: add the wildcard domain `*.ark.wonderapps.biz` to the `wonderark` project (DNS: a
  wildcard CNAME to Vercel).
- Vercel production environment variables: `BASE_APP_HOST=ark.wonderapps.biz`,
  `ORG_ADDRESS_REQUIRED=true` (only after the above works), `PLATFORM_ADMIN_EMAILS` (exists).
- Supabase Auth → URL configuration: add `https://*.ark.wonderapps.biz/**` to the redirect
  allow-list so Google sign-in returns to the organization's address.
