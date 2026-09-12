/**
 * COMPLY-P1-01.5 (VAT ID Validation / VIES Where Supported): the provider-agnostic
 * contract for confirming a VAT ID is CURRENTLY REGISTERED, not just well-formed (that's
 * `validate.ts`'s own job). Mirrors `lib/irp-adapter/types.ts`'s own "backlog rule 7:
 * government integrations must be adapter-based" shape -- a request/response interface a
 * caller depends on, independent of which concrete provider implements it.
 *
 * **Checked reachability before writing anything (backlog rule 1, and this run's own
 * explicit instruction to check egress restrictions first, "same as prior stories hit with
 * GSTN docs")**: the real VIES SOAP endpoint lives at
 * `ec.europa.eu/taxation_customs/vies/services/checkVatService` (WSDL at
 * `ec.europa.eu/taxation_customs/vies/checkVatService.wsdl`). This session's own network
 * egress proxy returned `EGRESS_BLOCKED` for BOTH `ec.europa.eu` and
 * `taxation-customs.ec.europa.eu` when fetched directly (confirmed live, not assumed) --
 * every EU Commission domain this session tried is unreachable, the exact "GSTN docs
 * blocked" pattern this run's own instructions predicted for a non-India government
 * system. There is therefore no real, working VIES implementation this session can build
 * and verify end-to-end -- `StubViesAdapter` below is a CLEARLY-LABELED stub, not a
 * disguised fake, matching this run's own explicit instruction ("a real (or clearly
 * stubbed-and-documented, if VIES's live SOAP endpoint is unreachable) format/checksum
 * validation").
 *
 * The interface itself is real and useful regardless: `validateEuVatId` (format/checksum)
 * plus this contract together are exactly what COMPLY-P1-01.3's own `buyerVatIdValidated`
 * input needs -- a future session with reachable egress (or a live production deployment,
 * where this sandbox's own proxy restriction does not apply) can implement `ViesAdapter`
 * for real against this exact same interface with zero changes to any caller.
 */

export type ViesCheckRequest = {
  /** ISO 3166-1 alpha-2 country code (VIES itself uses "EL" for Greece and "XI" for
   * Northern Ireland instead of their ISO codes -- a caller's own responsibility to map,
   * not this adapter's, matching `IrpAdapter`'s own "pass through GSTN's own vocabulary
   * as-is" precedent for reason codes). */
  countryCode: string;
  /** The VAT number WITHOUT its country prefix (VIES's own convention). */
  vatNumber: string;
};

export type ViesCheckResponse = {
  valid: boolean;
  /** The registered trading name, when VIES returns one and the member state publishes
   * it -- not every member state does. `null` when not returned. */
  name: string | null;
  address: string | null;
  /** VIES's own consultation number -- proof-of-check evidence a business may need to
   * demonstrate due diligence on a zero-rated intra-EU supply. `null` when VIES doesn't
   * return one for this query. */
  consultationNumber: string | null;
  /** The complete, unmodified response body -- same "never silently drop what the
   * government actually returned" reasoning `IrpSubmitResponse.raw`/
   * `EwayBillGenerateResponse.raw` already established (COMPLY-P0-05.4/06.3). */
  raw: Record<string, unknown>;
};

/** The provider-agnostic contract every VIES integration in this module goes through. */
export interface ViesAdapter {
  check(request: ViesCheckRequest): Promise<ViesCheckResponse>;
}

export class ViesUnreachableError extends Error {
  constructor(countryCode: string) {
    super(
      `Cannot reach the VIES VAT-ID validation service to check ${countryCode} -- this sandboxed environment's own network egress proxy blocks every EU Commission domain (ec.europa.eu, taxation-customs.ec.europa.eu), confirmed live this session. Use validateEuVatId() for format/checksum validation instead; a live VIES check requires an environment with EU Commission network access.`,
    );
  }
}

/**
 * The one implementation this story ships -- a stub that always throws
 * `ViesUnreachableError` rather than silently returning a fabricated "valid"/"invalid"
 * result (backlog rule 11: never claim a fact this platform cannot actually establish).
 * Exists so callers can depend on the real `ViesAdapter` interface today; swapping this for
 * a real SOAP client in an environment with reachable egress needs no change anywhere else.
 */
export class StubViesAdapter implements ViesAdapter {
  async check(request: ViesCheckRequest): Promise<ViesCheckResponse> {
    throw new ViesUnreachableError(request.countryCode);
  }
}
