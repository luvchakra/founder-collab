-- EXP-PLAT-06 -- large exports (docs/plan/13-DATA-EXPORT-BACKLOG.md §17).
--
-- An export over the synchronous row limit (25,000 rows) is not built inside the request
-- that asked for it. The request records a job here, answers "Export queued", and the
-- file is built after the response has gone (Next's `after()`, still under the user's own
-- session), written to the private `exports` bucket, and the job marked ready. The bell
-- shows a "ready" alert derived from this table, and the download goes through
-- /api/exports/jobs/<id>/download, which re-checks ownership and hands out a short-lived
-- signed URL. Files expire after seven days.
--
-- No queue, no broker (CLAUDE.md's ADR-5): a table plus the existing daily cron.
--
-- Owner-only, not business-wide: an export is one person's download of what *they* were
-- allowed to see when they asked. A colleague with narrower permissions must not be able
-- to pick up someone else's finished file, so every policy below requires both
-- membership of the business and `requested_by = auth.uid()`.

create table core.export_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references core.businesses (id) on delete cascade,
  requested_by uuid not null default auth.uid(),
  adapter_id text not null,
  title text not null,
  format text not null check (format in ('csv', 'xlsx')),
  scope text not null check (scope in ('view', 'all')),
  filters jsonb not null default '{}'::jsonb,
  -- Same request twice (a double click, an impatient second click) while the first is
  -- still being built must not start a second job -- see the partial unique index below.
  dedupe_key text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed', 'expired')),
  row_count integer,
  filename text,
  file_path text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days'
);

create unique index export_jobs_one_in_flight_idx
  on core.export_jobs (requested_by, dedupe_key)
  where status in ('queued', 'running');
create index export_jobs_requester_idx on core.export_jobs (requested_by, created_at desc);
create index export_jobs_business_idx on core.export_jobs (business_id);

alter table core.export_jobs enable row level security;

create policy "requesters see their own export jobs"
  on core.export_jobs for select to authenticated
  using (requested_by = auth.uid() and business_id in (select core.user_business_ids()));

create policy "members queue their own export jobs"
  on core.export_jobs for insert to authenticated
  with check (requested_by = auth.uid() and business_id in (select core.user_business_ids()));

create policy "requesters update their own export jobs"
  on core.export_jobs for update to authenticated
  using (requested_by = auth.uid() and business_id in (select core.user_business_ids()))
  with check (requested_by = auth.uid() and business_id in (select core.user_business_ids()));

grant select, insert, update on core.export_jobs to authenticated;
grant all on core.export_jobs to service_role;

-- exports/<business_id>/<user_id>/<job_id>/<filename> -- private; readable and writable
-- only by the user the folder is named for, and only while they belong to the business.
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "Users read their own export files"
on storage.objects for select to authenticated
using (
  bucket_id = 'exports'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[1]::uuid in (select core.user_business_ids())
);

create policy "Users write their own export files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exports'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[1]::uuid in (select core.user_business_ids())
);
