import { builtinDataProvider } from "./builtin";
import {
  DATA_CAPABILITY_SCHEMA,
  DataProviderError,
  type DataCapability,
  type DataCapabilityInput,
  type DataCapabilityOutput,
  type DataProviderAdapter,
  type DataProviderResult,
} from "./contracts";
import { sandboxDataProvider } from "./sandbox";

/**
 * DISC-OFFER-P1-03.3: the one entry point Discovery code calls for external data. It
 * picks the configured adapter, runs the capability, validates the answer against the
 * normalized contract and turns every failure into a `DataProviderErrorCode`. Callers
 * never import an adapter directly.
 *
 * `DISCOVERY_DATA_PROVIDER` selects the adapter: unset or `builtin` -> the offline
 * checks; `sandbox` -> deterministic made-up data for development. A licensed external
 * provider is added as one more adapter here, with its credentials read inside it.
 */
const ADAPTERS: Record<string, DataProviderAdapter> = {
  [builtinDataProvider.key]: builtinDataProvider,
  [sandboxDataProvider.key]: sandboxDataProvider,
};

export function resolveDataProvider(env: Record<string, string | undefined> = process.env): DataProviderAdapter {
  const key = env.DISCOVERY_DATA_PROVIDER?.trim().toLowerCase();
  return (key && ADAPTERS[key]) || builtinDataProvider;
}

export function supportsCapability(capability: DataCapability, adapter: DataProviderAdapter = resolveDataProvider()): boolean {
  return Boolean(adapter.capabilities[capability]);
}

export async function runDataCapability<C extends DataCapability>(
  capability: C,
  input: DataCapabilityInput[C],
  adapter: DataProviderAdapter = resolveDataProvider(),
): Promise<DataProviderResult<DataCapabilityOutput[C]>> {
  const run = adapter.capabilities[capability] as ((input: DataCapabilityInput[C]) => Promise<unknown>) | undefined;
  if (!run) {
    return { ok: false, code: "not_supported", message: `${adapter.label} does not provide this.`, provider: adapter.key };
  }

  let raw: unknown;
  try {
    raw = await run(input);
  } catch (error) {
    if (error instanceof DataProviderError) return { ok: false, code: error.code, message: error.message, provider: adapter.key };
    console.error(`[data-providers] ${adapter.key} ${capability} failed`, error);
    return { ok: false, code: "provider_unavailable", message: "The data provider could not be reached.", provider: adapter.key };
  }

  const parsed = DATA_CAPABILITY_SCHEMA[capability].safeParse(raw);
  if (!parsed.success) {
    console.error(`[data-providers] ${adapter.key} ${capability} returned an invalid shape`, parsed.error.issues);
    return { ok: false, code: "invalid_response", message: "The data provider returned data in an unexpected shape.", provider: adapter.key };
  }
  return { ok: true, data: parsed.data as DataCapabilityOutput[C], provider: adapter.key, sandbox: adapter.sandbox };
}
