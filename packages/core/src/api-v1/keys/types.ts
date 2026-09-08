export interface ApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}
