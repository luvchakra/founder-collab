-- DISC-OFFER-P0-01.2: "Existing Product Compatibility" -- every product created before
-- DISC-OFFER-P0-01.1's own migration has offering_type = null. Backfilling it to
-- 'product' is not inventing a business fact: it's the literal, honest statement that
-- this row was previously modeled exclusively as a "Product" before Offering existed as
-- a wider concept -- the same default a founder would pick for it today if asked "was
-- this a product, service, subscription, ...?" Nothing else about the row changes; no
-- prospect/research/signal/ICP record under it is touched.
update discovery.products set offering_type = 'product' where offering_type is null;
