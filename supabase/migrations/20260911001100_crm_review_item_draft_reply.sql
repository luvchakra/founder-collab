-- CRM-08.6 (WonderArc CRM backlog, Epic CRM-08): "Review Response Drafting" -- an AI
-- draft needs somewhere to live between generation and a human's approve-and-publish
-- click. Columns on `crm.review_item` itself rather than a separate drafts table: at
-- most one live draft per review makes sense for this story's own scope (a human
-- either publishes it, edits it, or regenerates it -- there is no multi-draft history
-- requirement in the backlog), so a second table would be unused complexity.
-- `draft_input_hash` is CLAUDE.md principle 5's "cache all repeatable AI operations"
-- key: a re-open of the same review with nothing changed (same rating/comment/reviewer)
-- reuses the stored draft instead of re-billing the AI provider, the same "reuse an
-- already-stored result instead of re-calling the model" pattern
-- `module-discovery/lib/ai/research-prospect.ts` already established -- simpler here
-- since the hash lives right on the entity being drafted for, needing no separate
-- ai_runs lookup.
alter table crm.review_item
  add column draft_reply text,
  add column draft_input_hash text,
  add column draft_generated_at timestamptz;
