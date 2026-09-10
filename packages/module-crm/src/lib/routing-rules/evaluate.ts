import type { RoutingRule } from "./types";
import type { DetectedIntent } from "../ai/classify-intent";

/**
 * B3's routing conditions (docs/design/crm-module-design.md Part B) -- known-vs-new
 * sender, business hours, and detected intent/sentiment. `detectedIntent` comes from
 * `lib/ai/classify-intent.ts`'s keyword heuristic (see that file's own docstring on
 * why it's not a real AI call yet) -- a rule with `detected_intent_filter` set matches
 * only when the inbound message's detected intent is in that list; a rule with it null
 * doesn't filter on intent at all, same shape as `condition_known_sender`'s `"any"`.
 */
export type RuleMatchContext = {
  channelId: string | null;
  isKnownSender: boolean;
  detectedIntent?: DetectedIntent | null;
  now?: Date;
};

function currentTimeOfDay(now: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

/** `time` columns compare fine as "HH:MM:SS" strings, except across midnight -- a
 * window like 22:00:00-06:00:00 needs the wraparound branch below. */
function isWithinWindow(current: string, start: string, end: string): boolean {
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

export function ruleMatches(rule: RoutingRule, ctx: RuleMatchContext, timezone: string): boolean {
  if (!rule.is_active) return false;
  if (rule.channel_id && rule.channel_id !== ctx.channelId) return false;
  if (rule.condition_known_sender === "known" && !ctx.isKnownSender) return false;
  if (rule.condition_known_sender === "new" && ctx.isKnownSender) return false;
  if (rule.business_hours_start && rule.business_hours_end) {
    const current = currentTimeOfDay(ctx.now ?? new Date(), timezone);
    if (!isWithinWindow(current, rule.business_hours_start, rule.business_hours_end)) return false;
  }
  if (rule.detected_intent_filter && rule.detected_intent_filter.length > 0) {
    if (!ctx.detectedIntent || !rule.detected_intent_filter.includes(ctx.detectedIntent)) return false;
  }
  return true;
}

/** Lower `priority` wins first, matching listRoutingRules()'s own display order --
 * the first active rule (in that order) whose conditions all match. */
export function findMatchingRule(rules: RoutingRule[], ctx: RuleMatchContext, timezone: string): RoutingRule | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  return sorted.find((rule) => ruleMatches(rule, ctx, timezone)) ?? null;
}
