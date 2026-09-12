import type { EffectiveImsStatus, ImsAction } from "./types";

/** Pure: `null` (no `gst.ims_actions` row exists) becomes the distinct `"no_action"`
 * display status -- never silently relabeled `"accepted"` even though real GST practice
 * eventually deems it so at GSTR-3B filing time (backlog rule 11/12: a calculated result
 * must not overstate what has actually happened). Any recorded action passes through
 * unchanged. */
export function effectiveImsStatus(action: ImsAction | null): EffectiveImsStatus {
  return action ? action.action : "no_action";
}
