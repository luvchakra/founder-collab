-- COMPLY-P0-07.6 follow-up: `mcp__Supabase__get_advisors` (security) flagged
-- `gst.enforce_return_period_lock` immediately after the prior migration --
-- "Function Search Path Mutable" -- since the function was created with no pinned
-- `search_path`. Harmless in practice (the function only reads its own `new`/`old` row
-- fields, no unqualified table/function reference it could ever resolve against a
-- hijacked search path), but pinning it is the same discipline every other function in
-- this schema already follows and costs nothing -- fixed immediately as its own file,
-- kept separate from the already-applied trigger migration rather than silently editing
-- it, same "one file per apply_migration call" precedent COMPLY-P0-02.1's own
-- registration_id-index follow-up already established.

alter function gst.enforce_return_period_lock() set search_path = gst;
