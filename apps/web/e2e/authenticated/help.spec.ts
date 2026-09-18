import { expect, test } from "@playwright/test";
import { openSidebar } from "../support/sidebar";

/**
 * Get Help, signed in: the two things that genuinely need a session. Everything else
 * about these pages -- the guide content, the FAQ, the free retrieval path -- is public
 * and covered in e2e/unauthenticated/help.spec.ts, since `/help` needs no session at all
 * (core/db/middleware.ts).
 */
test.describe("Get Help (signed in)", () => {
  test("is reachable from the account menu", async ({ page }) => {
    await page.goto("/dashboard");
    await openSidebar(page);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Get Help" }).click();
    await expect(page).toHaveURL(/\/help$/);
  });

  /**
   * Writing a prose answer costs the platform's own AI credit, so app/help/actions.ts
   * only does it for a signed-in visitor -- core/help/assistant.ts's answerHelpQuestion,
   * not the free searchHelpSections an anonymous visitor gets. Without an AI credential
   * configured on this deployment it degrades to the same sections-only response
   * (labelled "Where to look"), which is still correct, not a failure -- so this asserts
   * only the part that holds either way: real links into the guides.
   */
  test("the ask box answers with links into the guides", async ({ page }) => {
    await page.goto("/help");
    await page.getByLabel("Your question").first().fill("How do I reconcile a bank statement?");
    // Exact: the app shell has its own "Ask the AI assistant" button.
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    const sources = page.getByRole("link", { name: /Banking/ });
    await expect(sources.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("How do I reconcile a bank statement?").first()).toBeVisible();
  });
});
