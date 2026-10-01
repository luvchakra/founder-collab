export interface AuditLogEntry {
  id: string;
  business_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  /** Per-business sequence number + SHA-256 hash chain (20260908100000_core_financial_controls.sql). */
  seq: number;
  prev_hash: string;
  row_hash: string;
}

export interface AuditChainVerification {
  valid: boolean;
  entries_checked: number;
  first_invalid_seq: number | null;
  reason: string | null;
}
