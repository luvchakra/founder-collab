import { describe, expect, it } from "vitest";
import { selectPlatformKey, type PlatformKeyRow } from "./platform-credential";

const row = (provider: PlatformKeyRow["provider"], enabled = true, key = `key-${provider}`): PlatformKeyRow => ({
  provider,
  encrypted_api_key: key,
  enabled,
});

describe("choosing the platform's key", () => {
  it("uses the only enabled key there is", () => {
    expect(selectPlatformKey([row("openai")])?.provider).toBe("openai");
  });

  // `enabled` is the switch a superadmin flips to take a provider out of service.
  // Honouring its key anyway would make that switch a lie.
  it("never uses a disabled provider, however good its key", () => {
    expect(selectPlatformKey([row("anthropic", false)])).toBeNull();
  });

  it("skips a disabled provider in favour of an enabled one", () => {
    expect(selectPlatformKey([row("anthropic", false), row("openai", true)])?.provider).toBe("openai");
  });

  // An AI call that picks a different provider run to run is impossible to reason about,
  // and ai_runs caching keyed on the model would thrash.
  it("is deterministic when several are enabled", () => {
    const rows = [row("google"), row("openai"), row("anthropic")];
    expect(selectPlatformKey(rows)?.provider).toBe("anthropic");
    expect(selectPlatformKey([...rows].reverse())?.provider).toBe("anthropic");
  });

  it("falls to openai when anthropic isn't configured", () => {
    expect(selectPlatformKey([row("google"), row("openai")])?.provider).toBe("openai");
  });

  it("reports nothing when nothing is configured", () => {
    expect(selectPlatformKey([])).toBeNull();
  });

  it("ignores a row with an empty key rather than returning an unusable credential", () => {
    expect(selectPlatformKey([row("anthropic", true, "")])).toBeNull();
    expect(selectPlatformKey([row("anthropic", true, ""), row("openai")])?.provider).toBe("openai");
  });

  // A configured, enabled key for a provider this build doesn't rank is still better than
  // behaving as though nothing were configured.
  it("still uses an enabled provider it doesn't rank", () => {
    const exotic = { provider: "mistral", encrypted_api_key: "k", enabled: true } as unknown as PlatformKeyRow;
    expect(selectPlatformKey([exotic])?.provider).toBe("mistral" as PlatformKeyRow["provider"]);
  });
});
