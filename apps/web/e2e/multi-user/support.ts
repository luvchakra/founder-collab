import { expect, type Page, type TestInfo } from "@playwright/test";
import { loadTenants, type QaUserKey } from "../support/tenants";

/** Signs in as a seeded user through the real /login form (never a minted cookie). */
export async function loginAs(page: Page, user: QaUserKey): Promise<void> {
  const t = loadTenants();
  await page.goto("/login");
  await page.getByLabel("Email").fill(t.users[user].email);
  await page.getByLabel("Password", { exact: true }).fill(t.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await page.waitForURL(/\/(dashboard|onboarding)(?:$|[/?])/, { timeout: 30_000 });
}

/** CLAUDE.md's "report what actually happened" applied to the suite itself: a page that
 * reaches the right URL while throwing underneath is not a pass. Collects uncaught page
 * errors, console errors and 5xx responses; call `assertClean()` at the end of a test. */
export function watchForErrors(page: Page, testInfo: TestInfo) {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Expected noise: the browser logs every intentionally-refused request (the 4xx this
    // suite provokes on purpose) as a console error.
    if (/status of 4\d\d|Failed to load resource: the server responded with a status of 4/.test(text)) return;
    // Sandboxes that re-terminate TLS through a proxy the browser doesn't trust (the cloud
    // environment this suite was built in) fail third-party asset loads this way. Opt-in
    // only: in a normal environment a certificate error is a real finding.
    if (process.env.E2E_IGNORE_CERT_ERRORS === "1" && /ERR_CERT_AUTHORITY_INVALID/.test(text)) return;
    problems.push(`console: ${text.slice(0, 2500)}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
  });
  return {
    assertClean() {
      if (problems.length) testInfo.attach("browser-errors", { body: problems.join("\n"), contentType: "text/plain" });
      expect(problems, "browser console errors / uncaught exceptions / 5xx responses").toEqual([]);
    },
  };
}

/** A foreign or nonexistent record must be refused without its content: Next's
 * not-found page, the not-licensed page, or a redirect away -- never the record. */
export async function expectRefused(page: Page, forbiddenText: string[]): Promise<void> {
  for (const text of forbiddenText) await expect(page.getByText(text, { exact: false })).toHaveCount(0);
}
