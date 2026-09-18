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
  - Suppliers stage this feed and the Discovery→CRM handoff described in
    the CRM guide will draw on the same supplier/customer records.
- **Sales Orders** — create, confirm, ship, or cancel. Shipping a sales
  order is the outbound counterpart to receiving a PO: it's what reduces
  on-hand stock.
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
- **Dashboard** — a summary view, filterable by warehouse.

## Team & permissions

Inventory no longer has its own Team page — access is configured for the
whole business at **Admin → Team**, alongside every other module. Three of
the eight built-in roles are inventory-specific: **Inventory Manager**,
**Procurement Manager**, and **Warehouse Operator** — check that page to see
exactly which of the workflows above each one can perform (e.g. who can
approve a PO vs. just receive stock against one).

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
