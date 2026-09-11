import { describe, expect, it } from "vitest";
import { buildSendMediaRequest, buildSendTemplateRequest, buildSendTextRequest, parseWhatsAppWebhookPayload } from "./cloud-api-adapter";

describe("buildSendTextRequest", () => {
  it("builds a WhatsApp Cloud API text-message request", () => {
    const request = buildSendTextRequest("pn-1", "+911234500000", "Hello there");
    expect(request.url).toBe("https://graph.facebook.com/v20.0/pn-1/messages");
    expect(request.body).toEqual({ messaging_product: "whatsapp", to: "+911234500000", type: "text", text: { body: "Hello there" } });
  });
});

describe("buildSendMediaRequest", () => {
  it("builds an image-message request with a caption", () => {
    const request = buildSendMediaRequest("pn-1", "+911234500000", "https://example.com/a.jpg", "Look at this");
    expect(request.body).toEqual({
      messaging_product: "whatsapp",
      to: "+911234500000",
      type: "image",
      image: { link: "https://example.com/a.jpg", caption: "Look at this" },
    });
  });
});

describe("buildSendTemplateRequest", () => {
  it("builds a template-message request with variables as body parameters", () => {
    const request = buildSendTemplateRequest("pn-1", "+911234500000", "quotation_follow_up", "en_US", { name: "Priya", amount: "5000" });
    expect(request.body).toEqual({
      messaging_product: "whatsapp",
      to: "+911234500000",
      type: "template",
      template: {
        name: "quotation_follow_up",
        language: { code: "en_US" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Priya" }, { type: "text", text: "5000" }] }],
      },
    });
  });

  it("omits the components array when there are no variables", () => {
    const request = buildSendTemplateRequest("pn-1", "+911234500000", "reactivation", "en_US", {});
    expect(request.body).toMatchObject({ template: { components: [] } });
  });
});

describe("parseWhatsAppWebhookPayload", () => {
  it("parses an inbound text message", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: "wamid.1", from: "911234500000", timestamp: "1700000000", type: "text", text: { body: "Hi there" } }],
              },
            },
          ],
        },
      ],
    };
    expect(parseWhatsAppWebhookPayload(payload)).toEqual([
      {
        kind: "message",
        externalMessageId: "wamid.1",
        externalActorId: "911234500000",
        senderPhone: "911234500000",
        occurredAt: new Date(1700000000 * 1000).toISOString(),
        text: "Hi there",
        mediaId: null,
      },
    ]);
  });

  it("parses an inbound media message, capturing the media id instead of text", () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.2", from: "911234500000", timestamp: "1700000000", type: "image", image: { id: "media-1" } }] } }] }],
    };
    const [event] = parseWhatsAppWebhookPayload(payload);
    expect(event).toMatchObject({ kind: "message", text: null, mediaId: "media-1" });
  });

  it("parses a status update", () => {
    const payload = {
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1700000100" }] } }] }],
    };
    expect(parseWhatsAppWebhookPayload(payload)).toEqual([
      { kind: "status", externalMessageId: "wamid.1", status: "delivered", occurredAt: new Date(1700000100 * 1000).toISOString() },
    ]);
  });

  it("maps an unrecognized status value to 'unknown' rather than dropping it", () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "deleted", timestamp: "1700000100" }] } }] }] };
    expect(parseWhatsAppWebhookPayload(payload)[0]).toMatchObject({ status: "unknown" });
  });

  it("returns an empty array for a payload with no entries", () => {
    expect(parseWhatsAppWebhookPayload({})).toEqual([]);
    expect(parseWhatsAppWebhookPayload(null)).toEqual([]);
  });

  it("flattens events across multiple entries and changes", () => {
    const payload = {
      entry: [
        { changes: [{ value: { messages: [{ id: "m1", from: "1", timestamp: "1700000000", type: "text", text: { body: "a" } }] } }] },
        { changes: [{ value: { statuses: [{ id: "m1", status: "sent", timestamp: "1700000001" }] } }] },
      ],
    };
    expect(parseWhatsAppWebhookPayload(payload)).toHaveLength(2);
  });
});
