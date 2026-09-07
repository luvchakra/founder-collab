export type DomainEventStatus = "pending" | "parked" | "processed" | "failed";

export interface DomainEvent {
  id: string;
  business_id: string;
  type: string;
  required_module: string | null;
  payload: Record<string, unknown>;
  status: DomainEventStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  published_at: string;
  processed_at: string | null;
}

export type EventHandler = (event: DomainEvent) => Promise<void>;
