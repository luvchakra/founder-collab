import { devices, expect, test, type Page } from "@playwright/test";

/**
 * BRAND-13 -- the "install the app" banner on the public landing page. Chromium cannot
 * really offer an install here, so the spec dispatches a synthetic `beforeinstallprompt`
 * whose prompt() is stubbed and records that it was called. The device presets are used
 * without their browser type so these run in the project's Chromium.
 */
/** A device preset minus its browser type (`test.use` refuses that inside a describe). */
function inChromium(name: string) {
  const preset: Partial<(typeof devices)[string]> = { ...devices[name] };
  delete preset.defaultBrowserType;
  return preset;
}
const pixel7 = inChromium("Pixel 7");
const iphone14 = inChromium("iPhone 14");

const banner = (page: Page) => page.getByRole("region", { name: /install the .+ app/i });

async function offerInstall(page: Page, outcome: "accepted" | "dismissed") {
  await page.evaluate((choice) => {
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>;
    event.prompt = async () => {
      (window as unknown as Record<string, unknown>).__promptCalls =
        (((window as unknown as Record<string, unknown>).__promptCalls as number) ?? 0) + 1;
    };
    event.userChoice = Promise.resolve({ outcome: choice, platform: "web" });
    window.dispatchEvent(event);
  }, outcome);
}

const stored = (page: Page) => page.evaluate(() => localStorage.getItem("wonderark:install-banner"));

test.describe("Install banner on a phone (Chromium)", () => {
  test.use(pixel7);

  test("appears after beforeinstallprompt, installs in one tap, and stays gone", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(banner(page)).toHaveCount(0);

    await offerInstall(page, "accepted");
    await expect(banner(page)).toBeVisible();
    // At the very top, once its entrance has settled, and above the site header, not over it.
    await expect.poll(async () => Math.round((await banner(page).boundingBox())?.y ?? -1)).toBe(0);
    const [bannerBox, headerBox] = await Promise.all([banner(page).boundingBox(), page.locator("header").first().boundingBox()]);
    expect(headerBox!.y).toBeGreaterThanOrEqual(bannerBox!.height - 1);

    await banner(page).getByRole("button", { name: "Install" }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__promptCalls)).toBe(1);
    expect(JSON.parse((await stored(page)) ?? "{}")).toEqual({ installed: true });

    await page.reload();
    await offerInstall(page, "accepted");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("closing it snoozes it", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await offerInstall(page, "dismissed");
    await banner(page).getByRole("button", { name: "Not now" }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(JSON.parse((await stored(page)) ?? "{}").snoozedUntil).toBeGreaterThan(Date.now() + 13 * 24 * 60 * 60 * 1000);
  });

  test("never appears on a customer-facing page", async ({ page }) => {
    await page.goto("/p/e/not-a-real-token");
    await offerInstall(page, "accepted");
    await page.waitForTimeout(300); // nothing to wait for: asserting an absence
    await expect(banner(page)).toHaveCount(0);
  });
});

test.describe("Install banner on an iPhone", () => {
  test.use(iphone14);

  test("shows the Add to Home Screen steps and remembers 'I've added it'", async ({ page }) => {
    await page.goto("/");
    await expect(banner(page)).toBeVisible();
    await banner(page).getByRole("button", { name: "How to" }).click();
    await expect(banner(page).getByText("Add to Home Screen", { exact: true })).toBeVisible();
    await expect(banner(page).getByRole("button", { name: "How to" })).toHaveAttribute("aria-expanded", "true");
    await banner(page).getByRole("button", { name: "I've added it" }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(JSON.parse((await stored(page)) ?? "{}")).toEqual({ installed: true });
  });
});

test.describe("Install banner on desktop", () => {
  test("never appears, even when the browser offers an install", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await offerInstall(page, "accepted");
    await page.waitForTimeout(300); // nothing to wait for: asserting an absence
    await expect(banner(page)).toHaveCount(0);
  });
});
