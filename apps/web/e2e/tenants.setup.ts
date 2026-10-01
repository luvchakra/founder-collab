import { test as setup } from "@playwright/test";
import { seedTenants } from "./support/tenants";

/** Seeds the two-tenant fixtures (support/tenants.ts) once per run. Every security
 * spec and the self-provisioned auth setup depend on this project. */
setup("seed two-tenant fixtures", async () => {
  setup.setTimeout(120_000);
  await seedTenants();
});
