-- Fix: Discovery > Dashboard (the bare business page) crashed whenever a product ended
-- up with more than one `discovery.workspaces` row, because every read
-- (getWorkspaceForProduct, getWorkspace, and the products(*, workspaces(*)) embed used by
-- the account-wide dashboard) assumes exactly one workspace per product ("every product
-- has exactly one workspace in the MVP, auto-created by the DB trigger" -- see
-- packages/module-discovery/src/lib/tenancy/queries.ts's own doc comment) and calls
-- `.maybeSingle()`, which throws a PostgREST error the moment a second row exists. That
-- invariant was only ever enforced by the auto-create trigger firing once per insert --
-- nothing stopped a second row being inserted directly (which is exactly how one product
-- on the dev project ended up with two: the trigger's own auto-created "Default" workspace
-- plus a manually seeded one). Enforcing it as a real UNIQUE constraint, matching what the
-- application code already assumes, is what actually prevents this class of bug rather
-- than just clearing today's duplicate row.
alter table discovery.workspaces
  add constraint workspaces_product_id_key unique (product_id);
