#!/usr/bin/env node
/**
 * Renders the landing page's product mock-ups, `apps/web/public/screens/*.png`.
 *
 * They are drawn, not captured: a live capture needs a business licensed for every module
 * and full of presentable data, and the landing page must not depend on one. So each
 * screen is HTML built from the app's own pieces -- the ui-theme.css colour tokens, Inter,
 * the lucide icons the app uses, the real sidebar navigation (module-registry) and the
 * WonderArk logo files -- with a sample business's data, rendered at 2x by Chromium.
 *
 * Keep them honest: a screen shows what the real page shows (its title, sections, column
 * headings, badges). When a page's layout or the shell changes, update its screen in
 * landing-screens/screens.mjs and rerun. Inter is bundled (landing-screens/fonts, SIL Open
 * Font License), so rendering needs no network.
 *
 * Usage: `npm run build:screens` (set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled
 * Chromium instead of Playwright's own).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import * as Icons from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SCREENS } from "./landing-screens/screens.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "apps", "web", "public", "screens");
const BRAND_DIR = join(ROOT, "apps", "web", "public", "brand");
const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "landing-screens", "fonts");

/** Inter as Google Fonts serves it: latin, and latin-ext (which holds the rupee sign). */
const FONT_FACES = [
  ["inter-latin.woff2", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"],
  ["inter-latin-ext.woff2", "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF"],
]
  .map(
    ([file, range]) =>
      `@font-face { font-family: Inter; font-weight: 400 700; src: url(data:font/woff2;base64,${readFileSync(join(FONT_DIR, file)).toString("base64")}) format("woff2"); unicode-range: ${range}; }`,
  )
  .join("\n");

/** The light-theme tokens the screens use, copied from packages/core/src/ui-theme.css. */
const TOKENS = `
  --navy: oklch(0.240 0.060 257.3);
  --blue: oklch(0.605 0.217 257.2);
  --action: oklch(0.534 0.192 257.4);
  --background: oklch(0.971 0.006 255);
  --fg: oklch(0.208 0.040 265.8);
  --card: #fff;
  --muted: oklch(0.968 0.007 248);
  --muted-fg: oklch(0.554 0.041 257.4);
  --accent: oklch(0.932 0.032 255);
  --accent-fg: oklch(0.513 0.182 257);
  --border: oklch(0.936 0.012 259.8);
  --input: oklch(0.906 0.017 256);
  --success: oklch(0.527 0.154 150);
  --success-bg: oklch(0.627 0.194 149 / 12%);
  --warning: oklch(0.554 0.135 66);
  --warning-bg: oklch(0.769 0.188 70 / 16%);
  --danger: oklch(0.505 0.213 27);
  --danger-bg: oklch(0.577 0.245 27 / 11%);
  --sidebar-fg: oklch(0.929 0.013 256);
  --sidebar-muted: oklch(0.704 0.04 257);
  --sidebar-accent: oklch(1 0 0 / 8%);
  --sidebar-border: oklch(1 0 0 / 10%);
`;

const CSS = `
:root { ${TOKENS} }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
body { font-family: Inter, system-ui, sans-serif; color: var(--fg); -webkit-font-smoothing: antialiased; font-size: 14px; }
svg { flex-shrink: 0; }
.row { display: flex; align-items: center; }
.between { justify-content: space-between; }
.grow { flex: 1; min-width: 0; }
.muted { color: var(--muted-fg); }
.truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Browser window (desktop) */
.window { width: 1400px; height: 900px; border-radius: 12px; overflow: hidden; background: var(--background); display: flex; flex-direction: column; }
.chrome { height: 40px; background: #eef1f6; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; padding: 0 16px; }
.dot { width: 12px; height: 12px; border-radius: 50%; }
.url { margin-left: 24px; height: 26px; flex: 0 1 520px; white-space: nowrap; overflow: hidden; border-radius: 8px; background: #fff; border: 1px solid var(--border); display: flex; align-items: center; gap: 8px; padding: 0 12px; font-size: 12px; color: var(--muted-fg); }
.app { flex: 1; display: flex; min-height: 0; }

/* Sidebar */
.sidebar { width: 256px; background: var(--navy); color: var(--sidebar-fg); display: flex; flex-direction: column; padding: 14px 12px 12px; gap: 4px; }
.logo { display: flex; align-items: center; gap: 8px; padding: 2px 8px 14px; font-weight: 700; font-size: 17px; letter-spacing: -0.01em; color: #fff; }
.logo img { height: 24px; }
.logo .ark { color: var(--blue); }
.nav { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border-radius: 8px; font-size: 14px; color: var(--sidebar-fg); }
.nav.primary { background: var(--action); color: #fff; font-weight: 500; height: 40px; }
.nav.module { font-weight: 500; }
.nav.module.open { background: var(--sidebar-accent); color: #fff; }
.nav.module .chev { margin-left: auto; opacity: 0.8; }
.sub { margin-left: 15px; padding-left: 10px; border-left: 1px solid var(--sidebar-border); display: flex; flex-direction: column; gap: 2px; padding-top: 2px; padding-bottom: 4px; }
.sub .nav { height: 32px; font-size: 13.5px; }
.sub .nav.active { background: var(--sidebar-accent); color: #fff; font-weight: 500; }
.heading { display: flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sidebar-muted); padding: 8px 6px 4px; }
.sidebar .spacer { flex: 1; }
.usage { padding: 8px 6px; font-size: 11px; color: var(--sidebar-muted); }
.bar { height: 4px; border-radius: 4px; background: oklch(1 0 0 / 14%); margin-top: 6px; overflow: hidden; }
.bar > div { height: 100%; background: var(--blue); }
.user { border-top: 1px solid var(--sidebar-border); padding: 12px 4px 2px; display: flex; align-items: center; gap: 10px; }
.avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--blue); color: #fff; font-size: 12px; font-weight: 600; display: grid; place-items: center; flex-shrink: 0; }
.user .name { font-size: 13px; font-weight: 600; color: #fff; }
.user .email { font-size: 11px; color: var(--sidebar-muted); }

/* Top bar */
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.topbar { height: 56px; background: #fff; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; padding: 0 20px; flex-shrink: 0; }
.switcher { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 10px; background: var(--accent); border: 1px solid oklch(0.605 0.217 257.2 / 25%); color: var(--accent-fg); font-weight: 500; font-size: 14px; max-width: 240px; }
.icon-btn { position: relative; width: 36px; height: 36px; display: grid; place-items: center; color: var(--fg); }
.badge-dot { position: absolute; top: 3px; right: 3px; min-width: 16px; height: 16px; border-radius: 8px; background: #e11d2e; color: #fff; font-size: 10px; font-weight: 600; display: grid; place-items: center; padding: 0 4px; }
.content { flex: 1; overflow: hidden; padding: 28px 32px; display: flex; flex-direction: column; gap: 20px; }

/* Page furniture */
h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.015em; }
h2 { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
h3 { font-size: 15px; font-weight: 600; }
.sub-title { margin-top: 4px; color: var(--muted-fg); font-size: 14px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 1px 2px oklch(0.22 0.04 265 / 5%); }
.card-pad { padding: 18px 20px; }
.card-head { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 8px; font-size: 13px; font-weight: 500; border: 1px solid var(--input); background: #fff; color: var(--fg); white-space: nowrap; }
.btn.primary { background: var(--action); color: #fff; border-color: var(--action); }
.btn.sm { height: 30px; font-size: 12.5px; padding: 0 10px; }
.badge { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 11.5px; font-weight: 500; white-space: nowrap; background: var(--muted); color: var(--muted-fg); border: 1px solid var(--border); }
.badge.success { background: var(--success-bg); color: var(--success); border-color: transparent; }
.badge.warning { background: var(--warning-bg); color: var(--warning); border-color: transparent; }
.badge.danger { background: var(--danger-bg); color: var(--danger); border-color: transparent; }
.badge.info { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
.stat { padding: 16px 18px; }
.stat .label { font-size: 13px; color: var(--muted-fg); }
.stat .value { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; margin-top: 4px; }
.stat .detail { font-size: 12px; margin-top: 4px; color: var(--muted-fg); }
.grid { display: grid; gap: 14px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; font-size: 11.5px; font-weight: 500; color: var(--muted-fg); padding: 10px 20px; border-bottom: 1px solid var(--border); background: var(--muted); }
td { padding: 12px 20px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.nowrap, .nowrap td { white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.tabs { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--muted); border: 1px solid var(--border); }
.tab { height: 28px; padding: 0 12px; border-radius: 7px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; color: var(--muted-fg); }
.tab.on { background: #fff; color: var(--fg); box-shadow: 0 1px 2px oklch(0.22 0.04 265 / 10%); }

/* Phone (mobile) */
.phone { width: 376px; height: 812px; border-radius: 58px; background: #0d0f14; padding: 11px; }
.screen { width: 100%; height: 100%; border-radius: 47px; overflow: hidden; background: var(--background); display: flex; flex-direction: column; position: relative; }
.status { height: 46px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 6px 30px 0 34px; font-size: 15px; font-weight: 600; background: #fff; }
.island { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); width: 112px; height: 32px; border-radius: 20px; background: #0d0f14; }
.m-topbar { height: 54px; flex-shrink: 0; background: #fff; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 6px; padding: 0 10px 0 12px; }
.m-topbar .switcher { height: 34px; font-size: 13.5px; max-width: 200px; padding: 0 10px; }
.m-content { flex: 1; overflow: hidden; padding: 18px 16px; display: flex; flex-direction: column; gap: 16px; }
.m-content h1 { font-size: 21px; }
.m-content .sub-title { font-size: 13px; }
`;

/** A lucide icon as inline SVG, the way the app renders them. */
export function icon(name, size = 16, extra = {}) {
  const Icon = Icons[name];
  if (!Icon) throw new Error(`no lucide icon named ${name}`);
  return renderToStaticMarkup(createElement(Icon, { size, strokeWidth: 2, "aria-hidden": true, ...extra }));
}

function brandFile(prefix) {
  const file = readdirSync(BRAND_DIR).find((f) => f.startsWith(`${prefix}.`));
  if (!file) throw new Error(`no ${prefix} in apps/web/public/brand -- run npm run build:brand`);
  return `data:image/png;base64,${readFileSync(join(BRAND_DIR, file)).toString("base64")}`;
}

const MARK_ON_DARK = brandFile("logo-mark-on-dark");

/** The app's sidebar, with one module open (sections and items from module-registry). */
export function sidebar({ module, sections = [], usage = 34, user }) {
  const modules = [
    ["discovery", "Discovery", "Target"],
    ["inventory", "Inventory", "Package"],
    ["service", "Service", "Wrench"],
    ["crm", "CRM", "Inbox"],
    ["finance", "Finance", "Landmark"],
  ];
  const open = sections
    .map(
      (s) =>
        (s.heading ? `<div class="heading">${icon(s.collapsed ? "ChevronRight" : "ChevronDown", 11)}${s.heading}</div>` : "") +
        (s.collapsed ? "" : s.items.map(([label, ic, active]) => `<div class="nav${active ? " active" : ""}">${icon(ic, 16)}${label}</div>`).join("")),
    )
    .join("");
  return `<aside class="sidebar">
    <div class="logo"><img src="${MARK_ON_DARK}" alt="" /><span>Wonder<span class="ark">Ark</span></span></div>
    <div class="nav${module === "dashboard" ? " primary" : ""}">${icon("LayoutGrid", 16)}Executive Dashboard</div>
    ${modules
      .map(
        ([key, name, ic]) =>
          `<div class="nav module${key === module ? " open" : ""}">${icon(ic, 17)}${name}<span class="chev">${icon(key === module ? "ChevronDown" : "ChevronRight", 15)}</span></div>` +
          (key === module ? `<div class="sub">${open}</div>` : ""),
      )
      .join("")}
    <div class="spacer"></div>
    <div class="usage"><div class="row between"><span>AI Usage</span><span>${usage}%</span></div><div class="bar"><div style="width:${usage}%"></div></div></div>
    <div class="user"><div class="avatar">${user.initials}</div><div class="grow"><div class="name truncate">${user.name}</div><div class="email truncate">${user.email}</div></div>${icon("ChevronsUpDown", 14, { color: "currentColor" })}</div>
  </aside>`;
}

function topbar(business) {
  return `<header class="topbar">
    <div class="switcher">${icon("Building2", 16)}<span class="truncate">${business}</span>${icon("ChevronDown", 15)}</div>
    <div class="grow"></div>
    <div class="icon-btn">${icon("Bell", 19)}<span class="badge-dot">3</span></div>
    <div class="icon-btn">${icon("MessageCircle", 19)}</div>
  </header>`;
}

function mobileTopbar(business) {
  return `<header class="m-topbar">
    <div class="icon-btn">${icon("Menu", 21)}</div>
    <div class="switcher">${icon("Building2", 15)}<span class="truncate">${business}</span>${icon("ChevronDown", 14)}</div>
    <div class="grow"></div>
    <div class="icon-btn">${icon("Bell", 19)}<span class="badge-dot">3</span></div>
    <div class="icon-btn">${icon("MessageCircle", 19)}</div>
  </header>`;
}

function page(body) {
  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>${FONT_FACES}\n${CSS}</style></head><body>${body}</body></html>`;
}

function desktop(screen, ctx) {
  return page(`<div class="window">
    <div class="chrome"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
      <div class="url">${icon("Lock", 12)}ark.wonderapps.biz${screen.path}</div></div>
    <div class="app">${sidebar({ ...screen.sidebar, user: ctx.user })}
      <div class="main">${topbar(ctx.business)}<main class="content">${screen.body(ctx)}</main></div>
    </div></div>`);
}

function mobile(screen, ctx) {
  return page(`<div class="phone"><div class="screen">
    <div class="status"><span>9:41</span><span class="row" style="gap:6px">${icon("Signal", 16)}${icon("Wifi", 16)}${icon("BatteryFull", 22)}</span></div>
    <div class="island"></div>
    ${mobileTopbar(ctx.business)}
    <main class="m-content">${screen.body(ctx)}</main>
  </div></div>`);
}

/** The sample business every screen shows. */
const CONTEXT = {
  business: "Aurora Home Services",
  slug: "aurora-home-services",
  user: { initials: "AC", name: "Aiden Cole", email: "aiden@aurorahome.example" },
  icon,
};

async function main() {
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  );
  const only = process.argv.slice(2);
  for (const screen of SCREENS.filter((s) => only.length === 0 || only.includes(s.file))) {
    const isMobile = screen.frame === "mobile";
    const viewport = isMobile ? { width: 376, height: 812 } : { width: 1400, height: 900 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const tab = await context.newPage();
    await tab.setContent(isMobile ? mobile(screen, CONTEXT) : desktop(screen, CONTEXT), { waitUntil: "load" });
    await tab.evaluate(() => document.fonts.ready);
    const faces = await tab.evaluate(async () => (await document.fonts.load("600 14px Inter", "Aa₹")).length);
    if (faces < 2) throw new Error(`${screen.file}: Inter did not load`);
    const target = tab.locator(isMobile ? ".phone" : ".window");
    const png = await target.screenshot({ omitBackground: true });
    writeFileSync(join(OUT_DIR, `${screen.file}.png`), png);
    console.log(`build:screens — ${screen.file}.png`);
    await context.close();
  }
  await browser.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
