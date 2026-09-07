import type { EventHandler } from "./types";

/**
 * In-process map of event type -> handler, populated by each module's own
 * `events/handlers.ts` (00-MASTER-PLAN.md's module contract layout) at import time.
 * No module publishes or consumes a real event yet -- this starts empty, and the drain
 * loop treats an event type with no registered handler as a permanent failure (nothing
 * will ever fix that by retrying), not the same "not ready yet" condition as an
 * unlicensed required_module.
 */
const handlers = new Map<string, EventHandler>();

export function registerEventHandler(type: string, handler: EventHandler): void {
  handlers.set(type, handler);
}

export function getEventHandler(type: string): EventHandler | undefined {
  return handlers.get(type);
}
