-- Caught by get_advisors' unindexed_foreign_keys check immediately after applying
-- discovery_definitions: the icp_id soft-reference FK had no covering index either.
create index discovery_definitions_icp_id_idx on discovery.discovery_definitions (icp_id);
