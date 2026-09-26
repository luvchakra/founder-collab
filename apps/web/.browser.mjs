import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
export const SP = "/tmp/claude-0/-home-user-founder-collab/7e7e98f8-6b7a-59f4-a54a-97c34c1a4e28/scratchpad";
export const BASE = "https://wonderark.vercel.app";
export const creds = () => ({ email: readFileSync(`${SP}/e2e-email`, "utf8").trim(), password: readFileSync(`${SP}/e2e-password`, "utf8").trim() });
export async function launch() {
  return chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    proxy: { server: process.env.HTTPS_PROXY },
    args: [`--ignore-certificate-errors-spki-list=${readFileSync(`${SP}/proxy-spki`, "utf8").trim()}`],
  });
}
export async function login(page) {
  const { email, password } = creds();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
}
