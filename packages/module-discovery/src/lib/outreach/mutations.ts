import { createClient } from "../../db/server";
import type { OutreachChannel, OutreachStrategy } from "./types";

/** Item #5 of a UX pass: the founder can revise anything AI generated (strategy/channel/
 * key message/CTA) rather than only regenerating from scratch or approving as-is --
 * covers both a draft strategy and an already-approved one, since a founder catching a
 * mistake after approving shouldn't have to un-approve first just to fix a typo. */
export async function updateOutreachStrategy(
  strategyId: string,
  input: { strategy: string; channel: OutreachChannel; keyMessage: string; cta: string },
): Promise<OutreachStrategy> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_strategies")
    .update({
      strategy: input.strategy.trim(),
      channel: input.channel,
      key_message: input.keyMessage.trim(),
      cta: input.cta.trim(),
    })
    .eq("id", strategyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function approveOutreachStrategy(strategyId: string): Promise<OutreachStrategy> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outreach_strategies")
    .update({ status: "approved" })
    .eq("id", strategyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
