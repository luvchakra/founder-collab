import type { EventHandler } from "./types";

/**
 * In-process map of event type -> handlers, populated by each module's own
 * `events/handlers.ts` (00-MASTER-PLAN.md's module contract layout) at import time.
 * One event type can have more than one subscriber (e.g. both module-fsm and
 * module-crm consume `prospect.won`, for two unrelated reasons -- FSM opens an
 * opportunity, CRM surfaces the win on any open ticket for that party) -- an array per
 * type, not a single overwritten slot, is what actually lets that happen; a `Map<string,
 * EventHandler>` would silently drop every registration but the last one imported.
 * An event type with no registered handler at all is a permanent failure (nothing will
 * ever fix that by retrying), not the same "not ready yet" condition as an unlicensed
 * required_module.
 */
const handlers = new Map<string, EventHandler[]>();

export function registerEventHandler(type: string, handler: EventHandler): void {
  const existing = handlers.get(type);
  if (existing) existing.push(handler);
  else handlers.set(type, [handler]);
}

export function getEventHandlers(type: string): EventHandler[] {
  return handlers.get(type) ?? [];
}
