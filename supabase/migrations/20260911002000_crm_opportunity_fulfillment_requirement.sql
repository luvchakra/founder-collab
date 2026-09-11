-- INT-02.1 (Cross-Module Completion Backlog, Epic INT-02 "CRM Sale -> Inventory
-- Fulfillment"): "Fulfillment Requirement Gate" -- an explicit, CRM-owned classification
-- of whether an opportunity needs a downstream Inventory/FSM handoff at all, distinct
-- from (and not auto-overwritten by) the products/FSM engagement already attached to
-- it. Nullable, no default: null means "not yet gated" (the UI's own explicit prompt,
-- not a silent guess) -- the deterministic auto-suggestion this story's own
-- `suggestFulfillmentRequirement()` computes is a *default the user confirms or
-- overrides*, never written automatically, so a founder's own explicit choice (e.g.
-- "fulfilled_externally" for a product that shipped outside this system) is never
-- silently recomputed out from under them by a later story.
alter table crm.opportunity
  add column fulfillment_requirement text
    check (fulfillment_requirement in ('inventory_required', 'service_only', 'product_and_service', 'fulfilled_externally', 'not_required'));
