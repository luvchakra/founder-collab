-- Every other workspace-scoped table in this schema (product_knowledge, prospects,
-- contacts, ai_runs, etc.) indexes its workspace_id foreign key -- missed on
-- buyer_personas's own migration, caught by get_advisors' unindexed_foreign_keys check
-- immediately after applying it. Every RLS policy and listBuyerPersonas() itself filters
-- by workspace_id, so this is a real query path, not a speculative index.
create index buyer_personas_workspace_id_idx on discovery.buyer_personas (workspace_id);
