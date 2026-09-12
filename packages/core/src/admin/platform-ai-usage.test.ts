import { describe, expect, it } from "vitest";
import { CORE_AI_RUN_OPERATION_MODULE, listAiUsage } from "./platform-ai-usage";

/**
 * PLATFORM-P0-09.5 (AI Usage, §13). `listAiUsage()` itself needs a real Supabase
 * connection (service-role admin client against `core.ai_runs`/`discovery.ai_runs`), so
 * it is exercised for real only via the role-switched live-dev check this backlog's own
 * higher bar already applies to every admin file. This file locks down the one piece of
 * real, hand-written logic in `platform-ai-usage.ts` with no database round-trip: the
 * `CORE_AI_RUN_OPERATION_MODULE` map -- see the file's own top docstring for why this,
 * not a stored column, is how a `core.ai_runs` row's module is derived.
 */
describe("CORE_AI_RUN_OPERATION_MODULE (PLATFORM-P0-09.5)", () => {
  it("maps every operation module-crm currently logs to core.ai_runs, to 'crm'", () => {
    expect(CORE_AI_RUN_OPERATION_MODULE.summarize_customer).toBe("crm");
    expect(CORE_AI_RUN_OPERATION_MODULE.summarize_conversation).toBe("crm");
    expect(CORE_AI_RUN_OPERATION_MODULE.check_response_quality).toBe("crm");
    expect(CORE_AI_RUN_OPERATION_MODULE.draft_review_response).toBe("crm");
  });

  it("has no entry for an operation nothing currently logs to core.ai_runs -- an unmapped operation should show as unknown, not a guessed module", () => {
    expect(CORE_AI_RUN_OPERATION_MODULE.generate_icp).toBeUndefined();
    expect(CORE_AI_RUN_OPERATION_MODULE.chat).toBeUndefined();
  });

  it("exports listAiUsage as a function", () => {
    expect(typeof listAiUsage).toBe("function");
  });
});
