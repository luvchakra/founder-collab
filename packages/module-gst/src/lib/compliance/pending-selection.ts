/**
 * What a form-action-backed `<select>` should display: the choice the user made, until
 * the server has said something about it.
 *
 * This exists because of a specific React behaviour. A `<form action={fn}>` resets its
 * uncontrolled fields once the action completes — the same reset a native form does,
 * which restores each field to its *default*, not to whatever the user picked. The
 * compliance country bar submits on change with `defaultValue={profile.country}`, so
 * choosing a new country left the select showing the country it was mounted with, while
 * the badge beside it — plain server-rendered text — showed the new one. Two controls
 * disagreeing about the same fact, until a reload remounted the select and both agreed.
 *
 * Making the select controlled fixes that, but raises the question this answers: a
 * controlled select needs a value during the round trip, and the server's value is still
 * the old one until the action returns.
 *
 * The rule is deliberately *not* "show the pick while a submission is pending". That
 * would depend on React flipping the pending flag in the same render as the `setState`
 * beside it — true today, but a timing detail, and one render where neither held would
 * flash the old country back. It instead keeps the pick until the server has spoken,
 * which it has in exactly two ways:
 *
 *   - it accepted, and re-rendered with the new value — at which point `serverValue` and
 *     `submittedValue` agree and the distinction stops mattering;
 *   - it refused (an unsupported country, a permission that has since been revoked), and
 *     said so through the action's own error state — at which point the control must
 *     revert rather than keep advertising a change that never happened.
 */
export function pendingSelection(
  serverValue: string,
  submittedValue: string | null,
  rejected: boolean,
): string {
  if (rejected || submittedValue === null) return serverValue;
  return submittedValue;
}
