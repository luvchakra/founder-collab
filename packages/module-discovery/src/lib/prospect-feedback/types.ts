/** DISC-OFFER-P1 §7-02.1 "Prospect Feedback" -- the doc's own eleven-item closed
 * vocabulary, verbatim. Deliberately flat (not split into "prospect quality" vs
 * "message quality" vs "response" sub-fields) -- the doc names this one story with one
 * list, and a founder reacting in the moment ("this was spam") doesn't first classify
 * which axis their reaction belongs to. */
export type ProspectFeedbackTag =
  | "good_prospect"
  | "bad_prospect"
  | "wrong_person"
  | "wrong_timing"
  | "good_message"
  | "bad_message"
  | "interested"
  | "not_interested"
  | "already_customer"
  | "not_relevant"
  | "spam";

export const PROSPECT_FEEDBACK_TAG_LABEL: Record<ProspectFeedbackTag, string> = {
  good_prospect: "Good prospect",
  bad_prospect: "Bad prospect",
  wrong_person: "Wrong person",
  wrong_timing: "Wrong timing",
  good_message: "Good message",
  bad_message: "Bad message",
  interested: "Interested",
  not_interested: "Not interested",
  already_customer: "Already customer",
  not_relevant: "Not relevant",
  spam: "Spam",
};

export const PROSPECT_FEEDBACK_TAGS = Object.keys(PROSPECT_FEEDBACK_TAG_LABEL) as ProspectFeedbackTag[];

export type ProspectFeedback = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  feedback_tag: ProspectFeedbackTag;
  note: string | null;
  created_at: string;
};
