import { UNTRUSTED_RULES, untrusted } from "../shared/untrusted";

export const DILIGENCE_DRAFT_PROMPT_VERSION = "funding_diligence_draft_v1";

/** FND-13/16 — a first draft answer to an investor's diligence request from the founder's
 * profile and the data-room documents linked to it (by name and description only; file
 * contents are not read). The founder edits and submits it; AI never accepts or closes. */
export function diligenceDraftPrompt(input: { request: string; documents: string; profile: string }): string {
  return [
    "You are helping a founder draft a reply to an investor's due-diligence request.",
    UNTRUSTED_RULES,
    "Answer only from the founder's profile and the listed documents. Refer to documents by name.",
    "Where the material does not answer part of the request, say so plainly and list it in gaps. Never give legal or tax conclusions.",
    "",
    untrusted("investor_request", input.request),
    untrusted("linked_documents", input.documents),
    untrusted("founder_funding_profile", input.profile),
  ].join("\n");
}
