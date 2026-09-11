import { describe, expect, it } from "vitest";
import { classifyWhatsAppFailure } from "./failure-classification";

describe("classifyWhatsAppFailure", () => {
  it("classifies 401 as reauthorization_required", () => {
    expect(classifyWhatsAppFailure(401)).toBe("reauthorization_required");
  });

  it("classifies 403 as reauthorization_required", () => {
    expect(classifyWhatsAppFailure(403)).toBe("reauthorization_required");
  });

  it("classifies 429 as degraded", () => {
    expect(classifyWhatsAppFailure(429)).toBe("degraded");
  });

  it("classifies 500 and other 5xx as provider_error", () => {
    expect(classifyWhatsAppFailure(500)).toBe("provider_error");
    expect(classifyWhatsAppFailure(503)).toBe("provider_error");
  });

  it("classifies a missing status code (network failure) as provider_error", () => {
    expect(classifyWhatsAppFailure(undefined)).toBe("provider_error");
  });

  it("classifies other 4xx errors as message-specific, not a connection-health signal", () => {
    expect(classifyWhatsAppFailure(400)).toBeNull();
    expect(classifyWhatsAppFailure(404)).toBeNull();
  });
});
