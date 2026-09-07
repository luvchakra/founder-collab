export type OperationUsage = {
  operation: string;
  runs: number;
  cost: number;
};

export type WorkspaceUsage = {
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  totalRuns: number;
  totalCost: number;
  byOperation: OperationUsage[];
};

/** Same shape as WorkspaceUsage, rolled up across every workspace under one business --
 * see getBusinessUsage's own docstring for why that rollup is necessary. */
export type BusinessUsage = {
  businessId: string;
  periodStart: string;
  periodEnd: string;
  totalRuns: number;
  totalCost: number;
  byOperation: OperationUsage[];
};

