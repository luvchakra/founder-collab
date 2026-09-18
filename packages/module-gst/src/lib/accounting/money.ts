/** Ledger money: two decimals always, unlike the platform's headline `inr` formatter,
 * which rounds to whole rupees for KPI tiles. A balance that reads ₹1,234 when it is
 * actually ₹1,233.50 will not reconcile against anything. */
export const ledgerAmount = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
