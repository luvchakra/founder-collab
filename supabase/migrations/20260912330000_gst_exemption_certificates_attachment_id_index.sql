-- WonderArc Compliance backlog, COMPLY-P1-02.6 (United States -- Exemption Certificates).
-- Same-session follow-up fix, matching COMPLY-P0-07.6's and this epic's own COMPLY-P1-02.5
-- precedent: `mcp__Supabase__get_advisors` (performance) flagged `gst.exemption_
-- certificates`' own `attachment_id` foreign key as unindexed immediately after applying
-- the table migration.

create index exemption_certificates_attachment_id_idx on gst.exemption_certificates (attachment_id);
