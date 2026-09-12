import { describe, expect, it } from "vitest";
import { StubViesAdapter, ViesUnreachableError } from "./vies-adapter";

describe("StubViesAdapter", () => {
  it("throws ViesUnreachableError naming the country it couldn't check, rather than fabricating a result", async () => {
    const adapter = new StubViesAdapter();
    await expect(adapter.check({ countryCode: "DE", vatNumber: "136695976" })).rejects.toThrow(ViesUnreachableError);
    await expect(adapter.check({ countryCode: "DE", vatNumber: "136695976" })).rejects.toThrow(/DE/);
  });
});
