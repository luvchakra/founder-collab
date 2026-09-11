import { describe, expect, it } from "vitest";
import type { CrmEventPayloads, CrmEventType } from "./types";

/** CRM-01.4's acceptance criteria ("event names are documented", "payloads are
 * versionable") are compile-time properties more than runtime ones -- this test exists
 * mainly to keep the vocabulary from silently drifting: every event type must have a
 * corresponding payload entry, and every payload must carry a version tag. */
describe("CRM domain event vocabulary", () => {
  const REQUIRED_EVENT_TYPES: CrmEventType[] = [
    "crm.lead.created",
    "crm.lead.updated",
    "crm.lead.converted",
    "crm.opportunity.created",
    "crm.opportunity.stage_changed",
    "crm.opportunity.won",
    "crm.opportunity.lost",
    "crm.interaction.received",
    "crm.interaction.responded",
    "crm.follow_up.created",
    "crm.follow_up.completed",
    "crm.conversation.updated",
    "crm.channel.connected",
    "crm.review.received",
  ];

  it("declares exactly the backlog's required event names", () => {
    const samplePayloads: CrmEventPayloads = {
      "crm.lead.created": { v: 1, leadId: "l", partyId: "p", source: "manual" },
      "crm.lead.updated": { v: 1, leadId: "l", changedFields: [] },
      "crm.lead.converted": { v: 1, leadId: "l", opportunityId: "o" },
      "crm.opportunity.created": { v: 1, opportunityId: "o", partyId: "p", leadId: "l" },
      "crm.opportunity.stage_changed": { v: 1, opportunityId: "o", fromStageId: null, toStageId: null },
      "crm.opportunity.won": { v: 1, opportunityId: "o" },
      "crm.opportunity.lost": { v: 1, opportunityId: "o", reason: null },
      "crm.interaction.received": { v: 1, interactionId: "i", conversationId: "c", channel: "whatsapp", requiresResponse: true },
      "crm.interaction.responded": { v: 1, interactionId: "i", conversationId: "c" },
      "crm.follow_up.created": { v: 1, followUpId: "f", dueAt: "now", ownerId: null },
      "crm.follow_up.completed": { v: 1, followUpId: "f" },
      "crm.conversation.updated": { v: 1, conversationId: "c", status: "open" },
      "crm.channel.connected": { v: 1, channelConnectionId: "cc", channel: "whatsapp", provider: "whatsapp_business" },
      "crm.review.received": { v: 1, reviewItemId: "r", provider: "google_business_profile", rating: 5 },
    };

    for (const type of REQUIRED_EVENT_TYPES) {
      expect(samplePayloads[type].v).toBe(1);
    }
    expect(Object.keys(samplePayloads).sort()).toEqual([...REQUIRED_EVENT_TYPES].sort());
  });
});
