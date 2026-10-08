# Inventory: Catalog, Purchasing & Stock

Inventory manages your product catalog, warehouses, purchasing, sales
orders, and stock levels — one shared inventory per business, regardless of
how many Discovery offerings sit on top of it.

## Setup order

Set these up in this order — each later step references the ones before it:

1. **Warehouses** — create at least one location. Products, stock levels,
   purchase orders, sales orders, and transfers all reference a warehouse.
2. **Suppliers** and **Customers** — simple master-data lists. Set these up
   before creating purchase orders (suppliers) or sales orders (customers).
3. **Products** — create one by one, or bulk-import via **Products →
   Import**. The CSV needs a header row with `sku` and `name` at minimum;
   optional columns include `brand`, `category`, `supplier`, `unit`,
   `hsn_code`, `tax_rate`, `cost_price`, `selling_price`, `reorder_point`,
   `reorder_quantity`, `barcode`, `description`. The `supplier` column is
   matched by name against suppliers you've already created — set those up
   first if you're importing with supplier links. Note: this imports product
   *masters*, not opening stock balances — bring in your starting stock
   quantities via a purchase-order receipt or a manual stock movement (see
   below).

There's no separate "settings" screen for units of measure or numbering —
purchase order numbers auto-generate, units default to "pcs", and default
tax rates come from your business's Finance (GST) profile.

## Day-to-day workflows

- **Products** — catalog grid with category/supplier filters. Cost fields
  are only visible to users with cost-viewing permission; editing likewise
  requires an edit permission. Create, update, toggle active/inactive, and
  generate barcodes here.
- **Purchase Orders** — create a PO, approve it, and receive stock against
  it line by line (partial receipts are fine — receive what's arrived, and
  come back for the rest later). Tax amounts on each line calculate
  automatically from your business's tax profile and the supplier's
  location/registration — you never enter them by hand. **Receiving a line
  is the moment stock actually increases.**
- **Sales Orders** — create, confirm, ship, or cancel. Shipping a sales
  order is the outbound counterpart to receiving a PO: it's what reduces
  on-hand stock.
- **Sales Invoices** — **Generate invoice** from a confirmed sales order to
  get a GST-compliant invoice. Open an invoice for its line items and totals;
  set its payment status (**Unpaid**, **Partially paid** or **Paid**); and
  **Record credit note** — full, or partial with an amount and a reason — which
  needs the invoice-cancel permission. Credit notes are listed on the invoice
  and net off what is payable. Invoices from here appear in Finance's
  **Invoices** list and post to the ledger when Finance is licensed.
- **Customers** and **Suppliers** — the master-data lists the orders above
  draw on. Customers are the same list Service sees, when both are
  licensed.
- **Inventory (Stock)** — a live per-warehouse stock table, with a manual
  stock-movement action for corrections or physical counts outside the
  normal PO/SO flow.
- **Stock Transfers** — move stock between two warehouses with a full
  create → approve → ship → receive workflow, so you get an in-transit
  audit trail (stock leaves warehouse A on ship, lands in warehouse B on
  receive) rather than teleporting instantly.
- **Sales Returns** — create a return against a shipped/delivered sales
  order, then **approve** it. Approval — not creation — is the moment stock
  is actually restocked (or written off as damaged) and a credit note is
  issued against the original invoice.
- **Alerts** — low-stock notifications, also surfaced in the shared topbar
  bell across the whole platform.
- **Audit Log** — a history of changes for accountability.
- **Dashboard** — a summary view, filterable by warehouse once you have more
  than one:
  - tiles for **Inventory value** (only if your role can see costs),
    **Available**, **Reserved** and **Incoming** stock, **Stockout risk**,
    **Pending purchases** and **Sales today**;
  - a **Daily brief** — a plain-language summary, a healthy / low-stock /
    out-of-stock bar, and, when there is GST activity this month, the tax
    paid on purchases and collected on sales with a link to Finance's filing
    page;
  - a **Reorder watchlist** of products below their reorder point;
  - an **Attention center** listing overdue purchase orders, transfers in
    transit, alerts, and tax setup or supplier-GSTIN problems that put input
    tax credit at risk;
  - charts of **stock movement (14 days)** and **units on hand by warehouse**.

Every list has an **Export** button (CSV or Excel) that respects your
filters — see Getting Started §10.

## Team & permissions

Inventory has no Team page of its own — access is configured for the whole
business under **Users & access** (avatar menu → **Admin** → the business's
**Users & access** chip), alongside every other module. Three of the eight
built-in roles are inventory-specific: **Inventory Manager**, **Procurement
Manager**, and **Warehouse Operator**. Open **Roles** there to see exactly
which of the workflows above each one can perform (e.g. who can approve a PO
vs. just receive stock against one), or create a custom role. A person whose
role has no Inventory permissions doesn't see the module at all, even when the
business has it licensed.

## How this connects to other modules

- **Service (FSM)**: field jobs reserve parts from Inventory when scheduled,
  consume them on job completion, and release the reservation if a job is
  cancelled. This is entirely optional — jobs work fine without Inventory
  licensed, they just skip material tracking.
- **CRM**: an opportunity can turn into a real sales order (a "fulfillment
  request") without leaving the CRM screen; CRM can also poll that order's
  status and suggest in-stock substitutes when something's unavailable. A
  customer's Inventory order history shows up on their CRM "Customer 360"
  profile.
- Cost data is never exposed to the platform's AI assistant, regardless of
  the asking user's own permissions.
