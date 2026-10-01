import { expect, test, type Page } from "@playwright/test";
import { adminClient, loadTenants } from "../support/tenants";
import { loginAs, watchForErrors } from "./support";

/**
 * Accessibility smoke, responsive overflow and hostile-input handling
 * (E2E_TEST_PLAN.md §A11Y, §RESP, §INPUT). No extra dependency: the checks run in the
 * page itself and report every offender, so a failure names exactly what to fix.
 */

const PAGES = (slug: string) => [
  `/dashboard`,
  `/${slug}/discovery/dashboard`,
  `/${slug}/business`,
  `/${slug}/discovery/marketing`,
  `/${slug}/discovery/funding`,
  `/${slug}/inventory/products`,
  `/${slug}/service/jobs`,
  `/${slug}/service/customers`,
  `/${slug}/crm/leads`,
  `/${slug}/finance/accounts`,
  `/${slug}/admin/users`,
  `/${slug}/billing`,
];

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1280", width: 1280, height: 800 },
  { name: "mobile-390", width: 390, height: 844 },
];

/** Problems a screen reader or keyboard user would hit, found in the live DOM. */
async function a11yProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const name = (el: Element) => {
      const aria = el.getAttribute("aria-label") || el.getAttribute("title");
      if (aria?.trim()) return aria.trim();
      const by = el.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      if ("labels" in el && (el as HTMLInputElement).labels?.length) return [...(el as HTMLInputElement).labels!].map((l) => l.textContent).join(" ").trim();
      return (el.textContent ?? "").trim();
    };
    const h1s = [...document.querySelectorAll("h1")].filter(visible);
    if (h1s.length !== 1) out.push(`${h1s.length} visible <h1> elements (expected 1)`);
    for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
      if (visible(el) && !name(el)) out.push(`unlabelled ${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? ""}]`);
    }
    for (const el of document.querySelectorAll("button, [role=button], a[href]")) {
      if (visible(el) && !name(el) && !el.querySelector("img[alt]:not([alt=''])")) out.push(`unnamed ${el.tagName.toLowerCase()} ${(el as HTMLElement).outerHTML.slice(0, 80)}`);
    }
    for (const img of document.querySelectorAll("img")) {
      if (visible(img) && !img.hasAttribute("alt")) out.push(`img without alt ${img.getAttribute("src")?.slice(0, 60)}`);
    }
    return out;
  });
}

for (const vp of VIEWPORTS) {
  test(`A11Y/RESP key screens at ${vp.name}`, async ({ browser }, testInfo) => {
    test.setTimeout(300_000);
    const t = loadTenants();
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const login = await context.newPage();
    await loginAs(login, "ownerA");
    await login.close();
    const problems: string[] = [];
    for (const path of PAGES(t.businesses.A.slug)) {
      // A fresh tab per screen: navigating one tab away mid-hydration makes React report
      // teardown errors (#418 / parentNode) against the NEXT page, which is noise about
      // the test's pace, not a defect in either page.
      const page = await context.newPage();
      const errors = watchForErrors(page, testInfo);
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${path}: page scrolls horizontally by ${overflow}px`);
      for (const p of await a11yProblems(page)) problems.push(`${path}: ${p}`);
      try {
        errors.assertClean();
      } catch (err) {
        const detail = String((err as Error).message).match(/"(pageerror|console|HTTP)[^"]*"/g)?.slice(0, 2).join(" ; ") ?? "";
        problems.push(`${path}: browser errors ${detail.slice(0, 2500)}`);
      }
      await page.close();
    }
    await context.close();
    testInfo.attach(`a11y-${vp.name}`, { body: problems.join("\n") || "none", contentType: "text/plain" });
    expect(problems).toEqual([]);
  });
}

test("A11Y keyboard: the login form is fully operable from the keyboard", async ({ page }) => {
  const t = loadTenants();
  await page.goto("/login");
  await page.getByLabel("Email").focus();
  await page.keyboard.type(t.users.ownerA.email);
  // Tab forward (past "Forgot password?") until the password field holds focus.
  const password = page.getByLabel("Password", { exact: true });
  for (let i = 0; i < 5 && !(await password.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.type(t.password);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
});

const HOSTILE = [
  `<script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">`,
  `Robert'); DROP TABLE core.parties;--`,
  `😀 Ünïcødé — 中文 — עברית`,
  `=HYPERLINK("https://evil.example","click"),"quoted"`,
  `line one\nline two, with a comma`,
];

test.describe("INPUT hostile values are stored and shown as plain text", () => {
  test.describe.configure({ mode: "serial" });
  const ids: string[] = [];

  test.afterAll(async () => {
    if (ids.length) await adminClient("core").from("parties").delete().in("id", ids);
  });

  test("rendered literally in the UI, never executed", async ({ page }) => {
    test.setTimeout(120_000);
    const t = loadTenants();
    for (const name of HOSTILE) {
      const { data } = await adminClient("core").from("parties").insert({ business_id: t.businesses.A.id, name }).select("id").single();
      ids.push(data!.id);
      await adminClient("core").from("party_roles").insert({ business_id: t.businesses.A.id, party_id: data!.id, role: "customer" });
    }
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs++;
      void d.dismiss();
    });
    await loginAs(page, "ownerA");
    await page.goto(`/${t.businesses.A.slug}/service/customers`);
    // Scoped to the desktop table: the md:hidden card list holds the same (hidden) text.
    const table = page.getByRole("table");
    await expect(table.getByText("😀 Ünïcødé", { exact: false })).toBeVisible();
    await expect(table.getByText("<script>", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(dialogs).toBe(0);
    // SQL-looking text is just a name; the table it names is intact.
    const { count } = await adminClient("core").from("parties").select("*", { count: "exact", head: true }).eq("business_id", t.businesses.A.id);
    expect(count).toBeGreaterThanOrEqual(HOSTILE.length);
  });

  test("CSV export escapes commas, quotes, newlines and neutralises formulas", async ({ page }) => {
    const t = loadTenants();
    await loginAs(page, "ownerA");
    const res = await page.request.get(`/api/exports/fsm.customers?business=${t.businesses.A.slug}&format=csv`);
    expect(res.status()).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("😀 Ünïcødé");
    // RFC 4180: the comma/newline value is one quoted field, quotes doubled.
    expect(csv).toContain(`"line one\nline two, with a comma"`);
    // Spreadsheet formula injection: a cell must never start with a bare = + - @.
    const formulaCells = csv.split(/\r?\n/).flatMap((line) => line.split(",")).filter((cell) => /^"?[=+\-@]/.test(cell) && !/^"?[-+]?\d/.test(cell));
    expect(formulaCells, "cells a spreadsheet would execute as formulas").toEqual([]);
  });

  // E2E-DEF-010 (open, P3): core.parties has no CHECK on a blank name, so any member with
  // write access can create a nameless customer through the API. Kept as a known-failing
  // check (fixme reports it as skipped, never as passed) until a constraint is agreed --
  // see E2E_DEFECTS.md for why it wasn't added blind.
  test.fixme("blank and whitespace-only names are refused by the database itself", async () => {
    const t = loadTenants();
    const { userClient } = await import("../support/tenants");
    const { client } = await userClient(t.users.ownerA.email, t.password);
    for (const name of ["", "   "]) {
      const { error } = await client.schema("core").from("parties").insert({ business_id: t.businesses.A.id, name }).select("id");
      expect(error, `name ${JSON.stringify(name)}`).not.toBeNull();
    }
  });
});

// E2E-DEF-008 regression: the business-logo migration was never applied to the dev
// project (no logo_url column, no business-logos bucket), so this journey could not work.
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("LOGO a business owner uploads a logo; disguised and oversized files are refused", async ({ page }) => {
  test.setTimeout(180_000);
  const t = loadTenants();
  await loginAs(page, "ownerA");
  const upload = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
    // A fresh page per attempt: the form resets itself after each action, and racing that
    // reset with the next setInputFiles is what an earlier draft of this test tripped on.
    await page.goto(`/${t.businesses.A.slug}/business`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Business logo image").setInputFiles(file);
    await page.getByRole("button", { name: /^(Upload|Replace) logo$/ }).click();
  };

  await upload({ name: "evil.png", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(page.getByText("Only PNG, JPEG, WebP, or SVG images are supported.")).toBeVisible();

  await upload({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 0) });
  await expect(page.getByText("Logo must be 2MB or smaller.")).toBeVisible();

  await upload({ name: "logo.png", mimeType: "image/png", buffer: PNG_1PX });
  await expect(page.getByRole("button", { name: "Replace logo" })).toBeVisible({ timeout: 30_000 });
  const { data } = await adminClient("core").from("businesses").select("logo_url").eq("id", t.businesses.A.id).single();
  expect(data?.logo_url ?? "").toContain(`/business-logos/${t.businesses.A.id}/`);
});
