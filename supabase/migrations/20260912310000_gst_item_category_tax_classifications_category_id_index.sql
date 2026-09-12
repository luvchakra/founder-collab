-- WonderArc Compliance backlog, COMPLY-P1-02.5 (United States -- Product/Service
-- Taxability). Same-session follow-up fix, matching COMPLY-P0-07.6's own "kept as its own
-- migration file rather than editing the already-applied table migration" precedent:
-- `mcp__Supabase__get_advisors` (performance) flagged `gst.item_category_tax_
-- classifications`' own `category_id` foreign key as unindexed immediately after applying
-- the table migration -- its `unique (business_id, category_id)` index has `business_id` as
-- the LEADING column, which does not cover a lookup keyed by `category_id` alone. Every
-- other business-scoped table in this schema already indexes `business_id` on its own; this
-- adds the missing sibling for `category_id`.

create index item_category_tax_classifications_category_id_idx on gst.item_category_tax_classifications (category_id);
