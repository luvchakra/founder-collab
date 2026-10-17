-- DISC-AI-APPROVAL-01: a per-business choice of whether Discovery's AI flows ("Let AI
-- Auto-Populate Info" on an offering's Overview, and "Run AI Discovery") approve their own
-- proposals or leave them for a person to review.
--
--   'review' -- proposals are created but stay unapproved: the ICP is saved as a draft
--               version, accounts the AI finds stay in discovery.prospect_suggestions
--               (the Discover page's existing review queue) instead of becoming prospects,
--               and no outreach strategy is approved.
--   'auto'   -- the behaviour these flows had before this story.
--
-- Default 'review' for every business, existing and new: CLAUDE.md's AI rule 3 says AI
-- output doesn't act without a person's approval, so approving on the AI's own say-so is
-- something an owner turns on, not something they have to find and turn off. Nothing in
-- either mode sends anything; that never changes here.
--
-- Storage: a column on core.business_settings (00-MASTER-PLAN.md §5: the per-business
-- settings row), next to accounting_method and the GST fields, rather than a new table.
-- It inherits that table's RLS: members read their own business's row; updating it needs
-- business.settings.manage (20260926150000_core_rbac_roles.sql) -- owner and admin -- the
-- same key the server action checks with requirePermission(). How much the AI may decide
-- on the business's behalf is a business-governance setting, so it sits with the other
-- settings that key protects rather than with discovery.manage (which a sales manager has).
alter table core.business_settings
  add column discovery_ai_approval_mode text not null default 'review'
    check (discovery_ai_approval_mode in ('review', 'auto'));

-- Every change is audited through core.write_audit_log(), from a trigger so it is logged
-- whichever path made the change (the settings action, a direct PostgREST update by a
-- permitted member, or the service role).
create function core.log_discovery_ai_approval_mode_change()
returns trigger
language plpgsql
security definer
set search_path = core
as $$
begin
  if new.discovery_ai_approval_mode is distinct from old.discovery_ai_approval_mode then
    perform core.write_audit_log(
      new.business_id, auth.uid(), 'discovery.ai_approval_mode_changed', 'business_settings', new.business_id,
      jsonb_build_object('discovery_ai_approval_mode', old.discovery_ai_approval_mode),
      jsonb_build_object('discovery_ai_approval_mode', new.discovery_ai_approval_mode)
    );
  end if;
  return new;
end;
$$;

revoke execute on function core.log_discovery_ai_approval_mode_change() from public, anon, authenticated;

create trigger business_settings_log_discovery_ai_approval_mode
  after update on core.business_settings
  for each row execute function core.log_discovery_ai_approval_mode_change();

-- In 'review' mode a Run AI Discovery walk stops where it needs a person (a draft ICP, or
-- found accounts waiting on the Discover page). That run is neither completed nor failed,
-- so it gets its own status rather than being reported as either.
alter table discovery.pipeline_runs drop constraint pipeline_runs_status_check;
alter table discovery.pipeline_runs
  add constraint pipeline_runs_status_check
    check (status in ('running', 'completed', 'failed', 'awaiting_approval'));
