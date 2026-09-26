import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [name, path, w] of [["terms-desktop","/terms",1280],["privacy-mobile","/privacy",390],["pricing-desktop","/pricing",1280],["signup","/signup",1280]]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto("http://localhost:3100" + path);
  await p.screenshot({ path: "/tmp/claude-0/-home-user-founder-collab/7e7e98f8-6b7a-59f4-a54a-97c34c1a4e28/scratchpad/" + name + ".png", fullPage: name.startsWith("pricing") });
  const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(name, "overflow", o);
  await p.close();
}
await b.close();
