-- A cache for the Get Help assistant's answers.
--
-- **Why `platform` and not a tenant schema (CLAUDE.md non-negotiable #1)**: what is cached
-- here is an answer about *our own product documentation* -- the same question gets the
-- same answer for every business on the deployment, because the source material is
-- `docs/user-guides/*.md`, not anybody's data. No row here is tenant data, none of it is
-- gated by `core.licenses`, and scoping it per business would mean paying for the same
-- answer once per tenant for no benefit. That is exactly the control-plane carve-out
-- `platform` exists for.
--
-- **Why cache at all (CLAUDE.md development principle #5)**: "cache all repeatable AI
-- operations, keyed by input_hash + prompt_version". A help question is about as
-- repeatable as an AI operation gets -- everybody asks how to reconcile a bank statement.
-- `core.ai_runs` could not serve this: it is a usage ledger with no column for the result,
-- and it is `business_id`-scoped, which is the wrong grain for content that is identical
-- platform-wide.
--
-- **What the cache key covers**: `question_hash` is over the normalised question *and the
-- guide sections that were retrieved for it, bodies included*. That means editing a user
-- guide invalidates every answer drawn from the edited section automatically -- no
-- expiry to tune, no stale answer quoting documentation that no longer says that.
-- `prompt_version` covers a change in how the assistant is asked.
--
-- **Access**: service_role only, and deliberately no policy for `authenticated` at all.
-- The assistant runs server-side in a server action; nothing in a browser has any reason
-- to read or write this table directly. A cached answer is not secret, but an
-- unauthenticated write path into something the product displays as an answer would be.

create table platform.help_answers (
  id uuid primary key default gen_random_uuid(),

  -- Bumped in code whenever the assistant's instructions change, so old answers stop
  -- being served rather than being silently mixed with new ones.
  prompt_version text not null,
  -- sha256 of the normalised question plus the retrieved sections and their content.
  question_hash text not null,

  question text not null,
  answer text not null,
  -- The sections the answer was drawn from: [{ guideSlug, sectionId, heading, guideTitle }].
  -- Stored with the answer so a cache hit can render the same links a fresh answer would,
  -- without re-running retrieval.
  sources jsonb not null default '[]'::jsonb,

  provider text,
  model text,

  created_at timestamptz not null default now(),

  unique (prompt_version, question_hash)
);

alter table platform.help_answers enable row level security;

-- No policy and no grant for `authenticated` on purpose -- see the header comment. Only a
-- service-role client (the Get Help server action) ever touches this table.
grant all on platform.help_answers to service_role;
