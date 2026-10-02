/**
 * The landing page's product screens (scripts/build-landing-screens.mjs). Each mirrors one
 * real page -- its title, sections, columns and badges -- filled with a sample business.
 * `file` is the PNG under apps/web/public/screens; `frame` is "desktop" (browser window,
 * 2800x1800) or "mobile" (phone, 752x1624).
 */

const stat = (label, value, detail = "", tone = "") =>
  `<div class="card stat"><div class="row between"><span class="label">${label}</span></div><div class="value">${value}</div>${
    detail ? `<div class="detail"${tone ? ` style="color:var(--${tone})"` : ""}>${detail}</div>` : ""
  }</div>`;

const badge = (text, tone = "") => `<span class="badge ${tone}">${text}</span>`;

/** Executive Dashboard (apps/web/app/(dashboard)/dashboard/page.tsx), on a phone. */
const businessOverview = {
  file: "business-overview",
  frame: "mobile",
  body: ({ icon }) => {
    const card = (label, value, detail) =>
      `<div class="card stat" style="padding:14px 14px"><div class="row between"><span class="value" style="margin:0;font-size:22px">${value}</span>${icon("ChevronRight", 15, { color: "var(--muted-fg)" })}</div><div class="label" style="margin-top:6px">${label}</div>${detail ? `<div class="detail">${detail}</div>` : ""}</div>`;
    const widget = (ic, label, value, detail) =>
      `<div class="card stat" style="padding:14px 14px"><div class="row" style="gap:8px;color:var(--accent-fg)">${icon(ic, 15)}<span style="font-size:12.5px;font-weight:600;color:var(--fg)">${label}</span></div><div class="value" style="font-size:22px;margin-top:8px">${value}</div><div class="detail">${detail}</div></div>`;
    return `
      <div><h1>Executive Dashboard</h1><p class="sub-title">Actionable data and key configuration across every module -- quick links to the areas you manage most.</p></div>
      <section><h2 style="font-size:17px">Overview</h2>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          ${card("Businesses", "2")}
          ${card("Offerings", "4")}
          ${card("Prospects", "128", "42 qualified · 18 new")}
          ${card("AI credits (month)", "34%", "212 runs used")}
        </div></section>
      <section><h2 style="font-size:17px">Modules</h2>
        <p class="sub-title" style="font-size:12.5px">What each licensed module needs from you right now.</p>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          ${widget("Wrench", "Service", "6", "open jobs")}
          ${widget("Package", "Inventory", "3", "low-stock alerts")}
          ${widget("Inbox", "CRM", "4", "open tickets")}
          ${widget("Landmark", "Finance", "27", "e-invoices this month")}
        </div></section>
      <section><h2 style="font-size:17px">Conversions</h2>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
          ${card("Win rate", "31%", "won / (won + lost)")}
          ${card("Avg. fit score", "78", "of scored prospects")}
        </div></section>`;
  },
};

const exportBtn = (icon) => `<span class="btn sm">${icon("Download", 14)}Export${icon("ChevronDown", 13)}</span>`;
const header = (icon, title, subtitle, actions = "") =>
  `<div class="row between" style="align-items:flex-start;gap:16px"><div><h1>${title}</h1>${subtitle ? `<p class="sub-title">${subtitle}</p>` : ""}</div><div class="row" style="gap:8px">${actions || exportBtn(icon)}</div></div>`;

/** An offering's Prospects tab (discovery/offerings/[productId]/prospects). */
const discoveryProspects = {
  file: "discovery-pipeline",
  frame: "desktop",
  path: "/aurora-home-services/discovery/offerings/home-care-plans/prospects",
  sidebar: {
    module: "discovery",
    sections: [
      { items: [["Overview", "LayoutGrid"], ["Business", "Building2"]] },
      { heading: "Business offerings", collapsed: true },
      { heading: "Marketing", collapsed: true },
      { heading: "Customer acquisition", collapsed: true },
      { heading: "Funding", collapsed: true },
    ],
  },
  body: ({ icon }) => {
    const tabs = ["Overview", "ICP", "Discovery", "Opportunities", "Prospects", "Watchlist", "Performance", "Conversions", "History"];
    const fit = (n) => {
      const color = n >= 70 ? "oklch(0.627 0.194 149)" : n >= 40 ? "oklch(0.769 0.188 70)" : "oklch(0.577 0.245 27)";
      return `<span class="row" style="gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${color}"></span>${n}</span>`;
    };
    const status = (s) =>
      `<span class="badge${s === "qualified" ? " info" : ""}">${s}</span>`;
    const next = (a) => `<span class="btn sm" style="height:26px;font-size:12px">${a}</span>`;
    const row = ([company, industry, size, location, score, st, action, needs]) =>
      `<tr><td style="width:36px;padding-right:0"><span style="display:inline-block;width:15px;height:15px;border:1px solid var(--input);border-radius:4px"></span></td>
        <td style="font-weight:500">${company}</td><td class="muted">${industry}</td><td class="muted" style="white-space:nowrap">${size}</td><td class="muted">${location}</td>
        <td>${fit(score)}</td><td><span class="row" style="gap:6px">${status(st)}${needs ? `<span class="badge warning">Needs next step</span>` : ""}</span></td><td>${next(action)}</td></tr>`;
    const group = (label, rows) =>
      `<div class="card" style="overflow:hidden"><div style="padding:10px 20px;font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--muted-fg);border-bottom:1px solid var(--border)">${label}</div>
        <table><thead><tr><th></th><th>Company</th><th>Industry</th><th>Size</th><th>Location</th><th>Fit</th><th>Status</th><th>Next action</th></tr></thead><tbody>${rows.map(row).join("")}</tbody></table></div>`;
    return `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="muted" style="font-size:12.5px">Business <span style="opacity:.6">/</span> Business Offering</div>
        <div class="row between"><h1 style="font-size:22px">Home Care Plans</h1><span class="btn sm">${icon("Package", 14)}Home Care Plans${icon("ChevronDown", 13)}</span></div>
        <div class="row" style="gap:2px;border-bottom:1px solid var(--border)">${tabs
          .map((t) => `<span style="padding:8px 12px;font-size:13px;font-weight:500;${t === "Prospects" ? "color:var(--accent-fg);border-bottom:2px solid var(--action);margin-bottom:-1px" : "color:var(--muted-fg)"}">${t}</span>`)
          .join("")}</div>
      </div>
      ${header(icon, "Prospects", "", `${exportBtn(icon)}<span class="btn sm">${icon("Upload", 14)}Import CSV</span><span class="btn sm">${icon("Sparkles", 14)}Discover</span><span class="btn sm primary">${icon("Plus", 14)}Add</span>`)}
      <div class="row" style="gap:8px"><div class="row" style="gap:8px;height:34px;flex:0 1 360px;border:1px solid var(--input);border-radius:8px;background:#fff;padding:0 10px;color:var(--muted-fg);font-size:13px">${icon("Search", 14)}Search by company name...</div><span class="btn sm">Advanced${icon("ChevronDown", 13)}</span></div>
      ${group("SCORED (4)", [
        ["The Whitfield Residence", "Residential", "1-10", "Bengaluru", 94, "qualified", "Generate strategy", false],
        ["Ridgeview Residents Association", "Property management", "11-50", "Bengaluru", 88, "qualified", "Generate strategy", true],
        ["Lakeside Dental Clinic", "Healthcare", "11-50", "Mysuru", 81, "qualified", "Generate strategy", false],
        ["Okafor Family Homes", "Residential", "1-10", "Bengaluru", 63, "new", "Generate strategy", false],
      ])}
      ${group("MESSAGED (2)", [
        ["Alvarez Household", "Residential", "1-10", "Bengaluru", 82, "qualified", "Review message", true],
        ["Greenleaf Apartments", "Property management", "51-200", "Hosur", 76, "qualified", "Review message", false],
      ])}`;
  },
};

/** Inventory Dashboard (inventory/dashboard), on a phone. */
const inventoryDashboard = {
  file: "inventory-dashboard",
  frame: "mobile",
  body: ({ icon }) => {
    const kpi = (label, value, ic, tone = "") =>
      `<div class="card" style="padding:12px 13px"><div class="row between"><span style="font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-fg)">${label}</span><span style="color:${tone ? `var(--${tone})` : "var(--muted-fg)"}">${icon(ic, 14)}</span></div><div style="font-size:20px;font-weight:700;margin-top:6px;letter-spacing:-.02em">${value}</div></div>`;
    const seg = (parts) =>
      `<div class="row" style="height:8px;border-radius:6px;overflow:hidden;gap:2px">${parts.map(([w, c]) => `<div style="width:${w}%;height:100%;background:${c}"></div>`).join("")}</div>`;
    const watch = (name, sku, n) =>
      `<div class="row between" style="padding:9px 0;border-top:1px solid var(--border)"><div><div style="font-size:13px;font-weight:500">${name}</div><div class="muted" style="font-size:11.5px">${sku}</div></div><span class="badge" style="color:var(--warning);border-color:oklch(0.769 0.188 70 / 45%);background:#fff">Reorder ${n}</span></div>`;
    return `
      <div class="row between" style="align-items:flex-start"><div><h1>Inventory Dashboard</h1><p class="sub-title">Aurora Home Services - live across all warehouses.</p></div></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:9px">
        <div style="grid-column:span 2">${kpi("Inventory value", "₹4,86,250", "IndianRupee")}</div>
        ${kpi("Available stock", "1,284", "Boxes")}
        ${kpi("Reserved stock", "96", "Lock")}
        ${kpi("Incoming stock", "240", "Truck")}
        ${kpi("Stockout risk", "3", "TriangleAlert", "warning")}
      </div>
      <div class="card" style="padding:14px">
        <h3>Daily brief</h3>
        <p style="font-size:12.5px;line-height:1.5;margin-top:6px;color:var(--fg)">Aurora Home Services's inventory is worth ₹4,86,250 across 42 products. 1 is out of stock and 2 are below reorder point. 2 purchase orders are awaiting delivery.</p>
        <div style="margin-top:10px">${seg([[86, "var(--blue)"], [9, "oklch(0.769 0.188 70)"], [5, "oklch(0.577 0.245 27)"]])}</div>
        <div class="row" style="gap:12px;margin-top:8px;font-size:11px;color:var(--muted-fg)"><span class="row" style="gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:var(--blue)"></span>Healthy</span><span class="row" style="gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:oklch(0.769 0.188 70)"></span>Low stock</span><span class="row" style="gap:4px"><span style="width:7px;height:7px;border-radius:2px;background:oklch(0.577 0.245 27)"></span>Out of stock</span></div>
      </div>
      <div class="card" style="padding:14px 14px 4px">
        <h3>Reorder watchlist</h3>
        <div style="margin-top:8px">
          ${watch("R-410A Refrigerant (25 lb)", "HVAC-RFG-410", 10)}
          ${watch("Blower Motor 1/3 HP", "HVAC-BLW-050", 4)}
          ${watch("Dual Run Capacitor 45/5 MFD", "HVAC-CAP-002", 20)}
        </div>
      </div>`;
  },
};

/** Service Schedule (service/schedule), week view. */
const serviceSchedule = {
  file: "fsm-schedule",
  frame: "desktop",
  path: "/aurora-home-services/service/schedule",
  sidebar: {
    module: "service",
    sections: [
      { heading: "Overview", items: [["Dashboard", "LayoutDashboard"]] },
      { heading: "Pipeline", items: [["Opportunities", "Target"], ["Jobs", "Briefcase"]] },
      { heading: "Scheduling", items: [["Schedule", "CalendarDays", true], ["My Day", "Smartphone"]] },
      { heading: "Billing", items: [["Invoices", "FileText"]] },
      { heading: "Customers", items: [["Customers", "Users"]] },
    ],
  },
  body: ({ icon }) => {
    const days = ["Mon, 06 Oct", "Tue, 07 Oct", "Wed, 08 Oct", "Thu, 09 Oct", "Fri, 10 Oct"];
    const kindBadge = { work: "info", estimate: "", reminder: "" };
    const chip = ([kind, time, party, subject]) =>
      `<div style="border:1px solid var(--border);border-radius:8px;background:#fff;padding:6px 8px;font-size:11.5px;box-shadow:0 1px 2px oklch(0.22 0.04 265 / 5%)">
        <div class="row" style="gap:6px"><span class="badge ${kindBadge[kind]}" style="height:18px;font-size:10.5px;padding:0 6px${kind === "reminder" ? ";background:#fff" : ""}">${kind}</span><span class="muted">${time}</span></div>
        <div style="font-weight:500;margin-top:4px" class="truncate">${party}</div><div class="muted truncate">${subject}</div></div>`;
    const rows = [
      ["Unassigned", [[], [["estimate", "11:00 am", "Lakeside Dental Clinic", "AC site survey"]], [], [], []]],
      ["Ravi Kumar", [[["work", "09:30 am", "Whitfield Residence", "Annual HVAC tune-up"]], [["work", "10:00 am", "Ridgeview HOA", "Quarterly maintenance"]], [], [["work", "02:00 pm", "Greenleaf Apartments", "Duct cleaning"]], []]],
      ["Meera Nair", [[], [["work", "09:00 am", "Alvarez Household", "Water heater element"]], [["estimate", "03:30 pm", "Okafor Family Homes", "New install quote"]], [], [["work", "11:30 am", "Whitfield Residence", "Thermostat upgrade"]]]],
      ["Dev Patel", [[["reminder", "08:00 am", "Ridgeview HOA", "Filter change due"]], [], [["work", "10:30 am", "Lakeside Dental Clinic", "Chiller inspection"]], [["work", "09:00 am", "Nguyen Residence", "No-cool callout"]], []]],
      ["Sana Iqbal", [[], [], [["work", "01:00 pm", "Greenleaf Apartments", "Pump replacement"]], [], [["estimate", "10:00 am", "Kaveri Villas", "Solar water heater"]]]],
    ];
    const cols = "160px repeat(5, minmax(0, 1fr))";
    return `
      ${header(icon, "Schedule", "Work, estimate, and reminder events for Aurora Home Services, by technician.")}
      <div class="row between">
        <div class="row" style="gap:6px"><span class="btn sm">←</span><span class="btn sm">Today</span><span class="btn sm">→</span>
          <span class="tabs" style="margin-left:8px"><span class="tab">Day</span><span class="tab on">Week</span></span></div>
        <div class="row" style="gap:8px"><span class="btn sm">${icon("Printer", 14)}Print work orders</span><span class="btn sm primary">${icon("Plus", 14)}New event</span></div>
      </div>
      <div class="card" style="overflow:hidden;border-radius:16px">
        <div style="display:grid;grid-template-columns:${cols};background:var(--muted);border-bottom:1px solid var(--border)">
          <div style="padding:10px 14px;font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--muted-fg)">TECHNICIAN</div>
          ${days.map((d) => `<div style="padding:10px 10px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted-fg);border-left:1px solid var(--border)">${d}</div>`).join("")}
        </div>
        ${rows
          .map(
            ([name, cells]) => `<div style="display:grid;grid-template-columns:${cols};border-bottom:1px solid var(--border)">
            <div style="padding:12px 14px;font-size:13px;font-weight:500">${name}</div>
            ${cells.map((events) => `<div style="min-height:76px;padding:6px;border-left:1px solid var(--border);display:flex;flex-direction:column;gap:6px">${events.map(chip).join("")}</div>`).join("")}
          </div>`,
          )
          .join("")}
      </div>`;
  },
};

/** CRM Inbox (crm), on a phone: the ticket list as the page's own mobile cards. */
const crmInbox = {
  file: "crm-inbox",
  frame: "mobile",
  body: ({ icon }) => {
    const ticket = (subject, channel, status, tone, assignee, created, converted) =>
      `<div class="card" style="padding:13px 14px;display:flex;flex-direction:column;gap:8px">
        <div class="row between" style="gap:8px"><span style="font-weight:600;font-size:13.5px" class="truncate">${subject}</span><span class="badge ${tone}">${status}</span></div>
        <div class="row" style="gap:10px;font-size:12px" ><span class="muted row" style="gap:4px">${icon("MessageCircle", 13)}${channel}</span><span class="muted">${created}</span></div>
        <div style="font-size:12.5px"><span class="muted">Assigned to </span>${assignee}</div>
        <div class="row" style="gap:12px;white-space:nowrap"><span style="font-size:12.5px;font-weight:500;color:var(--accent-fg)">Customer 360</span>${converted ? `<span class="badge">Converted</span>` : `<span class="btn sm" style="height:26px;font-size:11.5px">Convert to prospect</span>`}</div>
      </div>`;
    return `
      <div><h1>Inbox</h1><p class="sub-title">Aurora Home Services's customer conversations.</p></div>
      <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:9px">
        <h3 style="font-size:14px">New ticket</h3>
        <div style="height:34px;border:1px solid var(--input);border-radius:8px;padding:0 10px;display:flex;align-items:center;font-size:13px;color:var(--muted-fg)">What's this about?</div>
        <div class="row" style="gap:8px"><div class="row between grow" style="height:34px;border:1px solid var(--input);border-radius:8px;padding:0 10px;font-size:13px">WhatsApp${icon("ChevronDown", 14)}</div><span class="btn sm primary" style="height:34px">Create ticket</span></div>
      </div>
      ${ticket("AC not cooling since morning", "WhatsApp", "open", "info", "Ravi Kumar", "Today, 9:12 am", false)}
      ${ticket("Quote for annual maintenance", "Email", "pending", "", "Meera Nair", "Today, 8:40 am", true)}
      ${ticket("Invoice copy for SO-2026-0041", "WhatsApp", "open", "info", "Unassigned", "Yesterday, 6:05 pm", false)}
      ${ticket("Reschedule Friday visit", "Website chat", "closed", "", "Dev Patel", "Yesterday, 2:30 pm", false)}`;
  },
};

/** Finance dashboard (finance/dashboard). */
const financeDashboard = {
  file: "finance-dashboard",
  frame: "desktop",
  path: "/aurora-home-services/finance/dashboard",
  sidebar: {
    module: "finance",
    sections: [
      { heading: "Overview", items: [["Dashboard", "LayoutDashboard", true], ["Exceptions", "ListChecks"]] },
      { heading: "Accounting", items: [["Chart of Accounts", "BookOpen"], ["Journal", "BookText"], ["Banking", "Landmark"], ["Invoices", "FileText"], ["Financial Reports", "BarChart3"]] },
      { heading: "Tax & GST", collapsed: true },
      { heading: "Records", collapsed: true },
    ],
  },
  body: ({ icon }) => {
    const risk = (sev, tone, ic, signal, details) =>
      `<tr><td><span class="badge ${tone}">${icon(ic, 12)}${sev}</span></td><td style="font-weight:500">${signal}</td><td class="muted">${details}</td><td><span class="btn sm" style="height:26px">Review</span></td></tr>`;
    const filing = (ret, period, due, status) =>
      `<tr><td style="font-weight:500">${ret}</td><td class="muted">${period}</td><td class="muted">${due}</td><td>${status}</td></tr>`;
    return `
      ${header(icon, "Finance dashboard", "Aurora Home Services -- where the money stands, and this month's GST snapshot.")}
      <div class="grid" style="grid-template-columns:repeat(5,1fr)">
        ${stat("Cash and bank", "₹8,42,300")}
        ${stat("Owed to you", "₹3,18,750", "Unpaid invoices")}
        ${stat("You owe", "₹1,26,400", "Unpaid bills")}
        ${stat("Profit this month", "₹2,04,900", "", "")}
        ${stat("Net GST position", "₹38,620", "Payable to the department")}
      </div>
      <div class="row between">
        <span class="badge" style="background:#fff;height:26px">${icon("CircleCheck", 13, { color: "var(--success)" })}GSTIN 29AAGCA7712K1ZQ</span>
        <div class="row" style="gap:8px"><span class="btn sm">GST Profile</span><span class="btn sm">e-Way Bill</span><span class="btn sm">e-Invoicing</span><span class="btn sm">GST Filing</span></div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(4,1fr)">
        ${stat("Payable (month)", "₹41,280", "input tax credit")}
        ${stat("Collected (month)", "₹79,900", "output tax")}
        ${stat("e-Invoices (month)", "27")}
        ${stat("GSTIN risk", "0", "none this month")}
      </div>
      <div class="grid" style="grid-template-columns:1.35fr 1fr;align-items:start">
        <div class="card" style="overflow:hidden">
          <div class="card-head"><h3>Compliance risk</h3><span class="muted" style="font-size:12.5px">1 high · 1 medium · 1 low</span></div>
          <table><thead><tr><th>Severity</th><th>Signal</th><th>Details</th><th>Action</th></tr></thead><tbody>
            ${risk("High", "danger", "TriangleAlert", "Unmatched ITC", "2 purchases not in GSTR-2B")}
            ${risk("Medium", "warning", "Clock", "E-invoice deadline", "INV-0187 due in 2 days")}
            ${risk("Low", "", "Info", "Invalid classification", "1 item without HSN")}
          </tbody></table>
        </div>
        <div class="card" style="overflow:hidden">
          <div class="card-head"><h3>Upcoming filings</h3></div>
          <table class="nowrap"><thead><tr><th>Return</th><th>Period</th><th>Due date</th><th>Status</th></tr></thead><tbody>
            ${filing("GSTR-1", "Sep 2026", "11 Oct 2026", `<span class="badge">${icon("CalendarClock", 12)}in review</span>`)}
            ${filing("GSTR-3B", "Sep 2026", "20 Oct 2026", `<span class="badge">${icon("CalendarClock", 12)}Not started</span>`)}
            ${filing("GSTR-3B", "Aug 2026", "20 Sep 2026", `<span class="badge success">${icon("Check", 12)}Filed</span>`)}
          </tbody></table>
        </div>
      </div>`;
  },
};

export const SCREENS = [businessOverview, discoveryProspects, inventoryDashboard, serviceSchedule, crmInbox, financeDashboard];
