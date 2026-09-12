import type { ReturnType } from "../returns/lifecycle/types";

export type FilingReminderSent = {
  id: string;
  businessId: string;
  returnType: ReturnType;
  periodEnd: string;
  leadDays: number;
  sentAt: string;
};
