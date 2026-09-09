import type { RoutingRule } from "./types";

/**
 * B3's real, deterministic routing conditions (docs/design/crm-module-design.md Part
 * B) -- known-vs-new sender and business hours. AI-detected intent isn't evaluated
 * here (see the routing-rules-extensions migration's own header comment on why); a
 * rule with `detected_intent_filter` set is simply never matched by this function
 * yet, same as an unlicensed module's contract call returning nothing rather than
 * pretending to have an answer.
 */
export type RuleMatchContext = {
  channelId: string | null;
  isKnownSender: boolean;
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
  return true;
}

/** Lower `priority` wins first, matching listRoutingRules()'s own display order --
 * the first active rule (in that order) whose conditions all match. */
export function findMatchingRule(rules: RoutingRule[], ctx: RuleMatchContext, timezone: string): RoutingRule | null {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  return sorted.find((rule) => ruleMatches(rule, ctx, timezone)) ?? null;
}
