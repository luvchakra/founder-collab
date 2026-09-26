/** DISC-OFFER-P0-04.1: "Discovery Definition" -- what to watch for and how, for one
 * offering. Distinct from `IcpProfile` (who to target) and `BuyerPersona` (who's on the
 * buying committee): a definition is the monitoring strategy itself, and an offering can
 * have several running at once (e.g. one for "Recently Funded", another for "Hiring
 * Relevant Roles"). */
export type MonitoringFrequency = "daily" | "weekly" | "monthly" | "manual";

export const MONITORING_FREQUENCY_LABEL: Record<MonitoringFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  manual: "Manual only",
};

export const MONITORING_FREQUENCY_VALUES = Object.keys(MONITORING_FREQUENCY_LABEL) as MonitoringFrequency[];

export type DiscoveryDefinition = {
  id: string;
  workspace_id: string;
  icp_id: string | null;
  name: string;
  target_geographies: string[];
  target_industries: string[];
  buyer_roles: string[];
  desired_signals: string[];
  excluded_signals: string[];
  disqualifiers: string[];
  minimum_score: number | null;
  monitoring_frequency: MonitoringFrequency;
  is_enabled: boolean;
  /** DISC-OFFER-P1-02.3: the `DISCOVERY_PLAYS` preset this definition was started from,
   * null when it was written from scratch, seeded by the pipeline, or predates the
   * column. What "which Discovery Plays perform best" groups outcomes by. */
  play_key: string | null;
  created_at: string;
  updated_at: string;
};
