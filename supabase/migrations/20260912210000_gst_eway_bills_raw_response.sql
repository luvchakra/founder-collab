-- WonderArc Compliance backlog, COMPLY-P0-10.2 (Government Response Store), first half:
-- `gst.eway_bills` has carried the same "narrow field selection discards the rest of the
-- government's own response" gap `gst.einvoices` had before COMPLY-P0-05.4's own
-- `20260912030000_gst_einvoices_raw_response.sql` closed it -- `EwayBillGenerateResponse
-- .raw` (COMPLY-P0-06.3's own adapter interface) has ALWAYS carried "the complete,
-- unmodified government response body," but `generateEwayBill` (lib/eway-bill/
-- mutations.ts) has never persisted it, only the four extracted fields (ewbNo/
-- validUpto/qrCode plus status). Checked the existing implementation first (backlog rule
-- 1): this is the exact same gap, on the sibling table, closed the exact same way.
--
-- Same nullable-jsonb reasoning as the einvoices migration: every row created before
-- this migration has none on record; null means "response not captured," never "no
-- response was ever received" (a populated `eway_bill_number` already proves one was).

alter table gst.eway_bills add column raw_response jsonb;
