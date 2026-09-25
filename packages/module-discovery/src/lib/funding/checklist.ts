import type { DataRoomCategory, ReadinessCategory } from "./types";

/**
 * FND-05/FND-12 — the starter checklists a founder can add with one click. Each item
 * starts Missing: adding the checklist asserts nothing about the company, it only lists
 * what investors commonly ask for. The founder marks items Ready themselves (§22.4).
 */
export const STANDARD_READINESS_ITEMS: { category: ReadinessCategory; title: string; description: string }[] = [
  { category: "company", title: "One-paragraph company overview", description: "What the company does, for whom, and why now." },
  { category: "product", title: "Product demo or walkthrough", description: "A short demo or annotated screenshots of the product in use." },
  { category: "market", title: "Market size with sources", description: "Target market and how it was sized, with the sources used." },
  { category: "traction", title: "Traction metrics with sources", description: "Customers, revenue, growth or usage — each with where the number comes from." },
  { category: "business_model", title: "Pricing and revenue model", description: "How the company charges, and recurring versus one-time revenue." },
  { category: "financials", title: "Historical financials", description: "Profit and loss, and cash position, for the last 12–24 months." },
  { category: "financials", title: "Financial projections", description: "Forward plan with its assumptions stated." },
  { category: "team", title: "Founder and team bios", description: "Relevant experience of the founders and key hires." },
  { category: "competition", title: "Competitive landscape", description: "Who else solves this problem and how the company differs." },
  { category: "gtm", title: "Go-to-market plan", description: "Channels, sales motion and evidence of what is working." },
  { category: "legal_compliance", title: "Incorporation documents", description: "Certificate of incorporation and constitutional documents." },
  { category: "legal_compliance", title: "Cap table", description: "Current shareholding, options and any convertible instruments." },
  { category: "fundraising_materials", title: "Pitch deck", description: "The current investor deck." },
  { category: "fundraising_materials", title: "Use of funds", description: "How the round will be spent and what it will achieve." },
  { category: "data_room", title: "Data room organised", description: "Core documents uploaded and categorised." },
];

export const STANDARD_DATA_ROOM_ITEMS: { category: DataRoomCategory; name: string }[] = [
  { category: "fundraising", name: "Pitch deck" },
  { category: "corporate", name: "Certificate of incorporation" },
  { category: "corporate", name: "Cap table" },
  { category: "financial", name: "Financial statements" },
  { category: "financial", name: "Financial model" },
  { category: "legal", name: "Shareholder agreements" },
  { category: "contracts", name: "Key customer contracts" },
  { category: "ip", name: "IP assignments" },
  { category: "team", name: "Team and org chart" },
  { category: "tax", name: "Tax registrations and filings" },
];
