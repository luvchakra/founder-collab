import base from "./playwright.config";
import { readFileSync } from "node:fs";
const spki = readFileSync("/tmp/claude-0/-home-user-founder-collab/7e7e98f8-6b7a-59f4-a54a-97c34c1a4e28/scratchpad/proxy-spki", "utf8").trim();
const launchOptions = {
  executablePath: "/opt/pw-browsers/chromium",
  proxy: { server: process.env.HTTPS_PROXY!, bypass: "localhost,127.0.0.1" },
  args: [`--ignore-certificate-errors-spki-list=${spki}`],
};
export default {
  ...base,
  workers: 3,
  timeout: 60_000,
  reporter: [["list"]],
  use: { ...base.use, launchOptions, trace: "off" },
  projects: base.projects!.map((p) => ({ ...p, use: { ...p.use, launchOptions } })),
};
