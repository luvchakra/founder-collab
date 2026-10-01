import { test as teardown } from "@playwright/test";
import { teardownTenants } from "./support/tenants";

/** Removes every e2e-qa account, business and user the run created (support/tenants.ts).
 * Set E2E_KEEP_FIXTURES=1 to keep them for debugging a failure by hand. */
teardown("remove two-tenant fixtures", async () => {
  teardown.setTimeout(120_000);
  if (process.env.E2E_KEEP_FIXTURES === "1") return;
  await teardownTenants();
});
