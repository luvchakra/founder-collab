import { beforeEach, describe, expect, it, vi } from "vitest";

/** PRIV-1: investor outreach honours opt-outs and carries one-click unsubscribe. */

const h = vi.hoisted(() => ({ send: vi.fn(), prepare: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: h.send };
  },
}));
vi.mock("@cofounderai/core/privacy/suppression", () => ({ prepareOutreachEmail: h.prepare }));

const { deliverInvestorEmail } = await import("./outreach-send");

const INPUT = { businessId: "biz-1", to: "p@fund.vc", subject: "Intro", body: "Hello", brandName: "Acme", websiteUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "founder@acme.com";
});

describe("deliverInvestorEmail (PRIV-1)", () => {
  it("does not send to an investor who opted out, and says so", async () => {
    h.prepare.mockResolvedValue({ suppressed: true });

    const result = await deliverInvestorEmail(INPUT);

    expect(h.prepare).toHaveBeenCalledWith("biz-1", "p@fund.vc");
    expect(h.send).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, provider: "resend", reason: expect.stringContaining("unsubscribed") });
  });

  it("sends with the List-Unsubscribe headers and footer link otherwise", async () => {
    const headers = { "List-Unsubscribe": "<https://x/api/unsubscribe?t=1>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
    h.prepare.mockResolvedValue({ suppressed: false, unsubscribeUrl: "https://x/api/unsubscribe?t=1", headers });
    h.send.mockResolvedValue({ data: { id: "msg_1" }, error: null });

    const result = await deliverInvestorEmail(INPUT);

    expect(result).toEqual({ ok: true, provider: "resend", messageId: "msg_1" });
    const sent = h.send.mock.calls[0]![0];
    expect(sent.headers).toEqual(headers);
    expect(sent.text).toContain("Unsubscribe: https://x/api/unsubscribe?t=1");
    expect(sent.html).toContain(">Unsubscribe</a>");
  });
});
