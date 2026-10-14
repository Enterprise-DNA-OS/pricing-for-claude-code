-- Demo price book for a New Zealand lubricants and workshop supplies distributor, with an Australian trade list.
-- Every name is invented. Dates are relative to today so the attention lists always have something to say.
-- Deliberate problems: a cost rise not yet passed through, a special below the floor and about to expire,
-- an unapproved special, an expired special still being honoured, rep discounting, a stale cost,
-- a consumer list missing GST and resale wording, and a price change one customer cannot be told about in time.

insert into margin_rules (product_group, floor_bps, target_bps) values
  ('*', 2500, 3500), ('Oils', 2200, 3200), ('Workshop', 3000, 4000)
on conflict do nothing;

insert into products (id, sku, name, product_group, unit) values
  ('10000000-0000-4000-8000-000000000001', 'OIL-1540-5L', 'Diesel engine oil 15W-40, 5 L', 'Oils', 'pail'),
  ('10000000-0000-4000-8000-000000000002', 'OIL-1540-20L', 'Diesel engine oil 15W-40, 20 L', 'Oils', 'drum'),
  ('10000000-0000-4000-8000-000000000003', 'OIL-0W20-5L', 'Synthetic engine oil 0W-20, 5 L', 'Oils', 'pail'),
  ('10000000-0000-4000-8000-000000000004', 'GRS-EP2-450', 'EP2 grease cartridge, 450 g', 'Greases', 'each'),
  ('10000000-0000-4000-8000-000000000005', 'COOL-LL-20L', 'Long life coolant, 20 L', 'Coolants', 'drum'),
  ('10000000-0000-4000-8000-000000000006', 'CLN-BRAKE-400', 'Brake cleaner aerosol, 400 g', 'Workshop', 'each'),
  ('10000000-0000-4000-8000-000000000007', 'GLV-NIT-100', 'Nitrile gloves, box of 100', 'Workshop', 'box'),
  ('10000000-0000-4000-8000-000000000008', 'FLT-OIL-Z9', 'Spin-on oil filter Z9', 'Filters', 'each')
on conflict do nothing;

insert into costs (product_id, cost_cents, currency, effective_from, source, actor) values
  ('10000000-0000-4000-8000-000000000001', 2450, 'NZD', current_date - 210, 'Supplier price file 2026-03', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000001', 2690, 'NZD', current_date - 20, 'Supplier increase letter, base oil surcharge', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000002', 8900, 'NZD', current_date - 210, 'Supplier price file 2026-03', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000002', 9750, 'NZD', current_date - 20, 'Supplier increase letter, base oil surcharge', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000003', 3100, 'NZD', current_date - 90, 'Supplier price file', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000004', 520, 'NZD', current_date - 120, 'Supplier price file', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000005', 6100, 'NZD', current_date - 120, 'Supplier price file', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000006', 410, 'NZD', current_date - 60, 'Landed cost, shipment 4471', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000007', 980, 'NZD', current_date - 60, 'Landed cost, shipment 4471', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000008', 760, 'NZD', current_date - 300, 'Supplier price file 2025-12', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000001', 2300, 'AUD', current_date - 30, 'AU warehouse landed cost', 'Demo seed'),
  ('10000000-0000-4000-8000-000000000002', 8400, 'AUD', current_date - 30, 'AU warehouse landed cost', 'Demo seed')
on conflict do nothing;

insert into price_lists (id, code, name, currency, audience, recommended_retail, gst_inclusive, resale_statement) values
  ('20000000-0000-4000-8000-000000000001', 'TRADE', 'Trade', 'NZD', 'trade', false, false, null),
  ('20000000-0000-4000-8000-000000000002', 'WORKSHOP', 'Workshop partner', 'NZD', 'trade', false, false, null),
  ('20000000-0000-4000-8000-000000000003', 'DIST', 'Distributor', 'NZD', 'distributor', false, false, null),
  ('20000000-0000-4000-8000-000000000004', 'RRP-NZ', 'Recommended retail, New Zealand', 'NZD', 'consumer', true, true, 'Recommended retail prices only. Resellers set their own selling prices.'),
  ('20000000-0000-4000-8000-000000000005', 'AU-TRADE', 'Trade, Australia', 'AUD', 'trade', false, false, null),
  ('20000000-0000-4000-8000-000000000006', 'RRP-AU', 'Recommended retail, Australia', 'AUD', 'consumer', true, false, null)
on conflict do nothing;

insert into list_prices (price_list_id, product_id, min_qty, price_cents, valid_from, source)
select l.id, p.id, v.min_qty, v.price_cents, current_date - 200, 'Price book 2026-04'
from (values
  ('TRADE', 'OIL-1540-5L', 1, 3390), ('TRADE', 'OIL-1540-20L', 1, 12900), ('TRADE', 'OIL-1540-20L', 10, 12400),
  ('TRADE', 'OIL-0W20-5L', 1, 4650), ('TRADE', 'GRS-EP2-450', 1, 890), ('TRADE', 'GRS-EP2-450', 48, 790),
  ('TRADE', 'COOL-LL-20L', 1, 8900), ('TRADE', 'CLN-BRAKE-400', 1, 690), ('TRADE', 'GLV-NIT-100', 1, 1650), ('TRADE', 'FLT-OIL-Z9', 1, 1290),
  ('WORKSHOP', 'OIL-1540-5L', 1, 3250), ('WORKSHOP', 'OIL-1540-20L', 1, 12300), ('WORKSHOP', 'OIL-0W20-5L', 1, 4450),
  ('WORKSHOP', 'GRS-EP2-450', 1, 850), ('WORKSHOP', 'COOL-LL-20L', 1, 8500), ('WORKSHOP', 'CLN-BRAKE-400', 1, 650),
  ('WORKSHOP', 'GLV-NIT-100', 1, 1550), ('WORKSHOP', 'FLT-OIL-Z9', 1, 1250),
  ('DIST', 'OIL-1540-5L', 1, 3050), ('DIST', 'OIL-1540-20L', 1, 11500), ('DIST', 'GRS-EP2-450', 1, 760), ('DIST', 'COOL-LL-20L', 1, 7900),
  ('RRP-NZ', 'OIL-1540-5L', 1, 4990), ('RRP-NZ', 'OIL-0W20-5L', 1, 6490), ('RRP-NZ', 'CLN-BRAKE-400', 1, 1199),
  ('AU-TRADE', 'OIL-1540-5L', 1, 3190), ('AU-TRADE', 'OIL-1540-20L', 1, 11900),
  ('RRP-AU', 'OIL-1540-5L', 1, 4590)
) as v(list, sku, min_qty, price_cents)
join price_lists l on l.code = v.list join products p on p.sku = v.sku
on conflict do nothing;

insert into customers (id, account, name, price_list_id, rep, email, notice_days) values
  ('30000000-0000-4000-8000-000000000001', 'NTHWKS', 'Northshore Diesel Workshop', '20000000-0000-4000-8000-000000000002', 'Aroha', 'accounts@northshore-diesel.example', 30),
  ('30000000-0000-4000-8000-000000000002', 'WAIFLEET', 'Waikato Fleet Services', '20000000-0000-4000-8000-000000000001', 'Mia', 'purchasing@waikato-fleet.example', 60),
  ('30000000-0000-4000-8000-000000000003', 'CANTAG', 'Canterbury Ag Contractors', '20000000-0000-4000-8000-000000000001', 'Lee', 'office@cant-ag.example', 30),
  ('30000000-0000-4000-8000-000000000004', 'OTAGODIST', 'Otago Lubes Distribution', '20000000-0000-4000-8000-000000000003', 'Aroha', 'buying@otagolubes.example', 90),
  ('30000000-0000-4000-8000-000000000005', 'BRISMECH', 'Brisbane Mobile Mechanics', '20000000-0000-4000-8000-000000000005', 'Lee', 'admin@brismech.example', 30),
  ('30000000-0000-4000-8000-000000000006', 'HBORCH', 'Hawke''s Bay Orchard Machinery', '20000000-0000-4000-8000-000000000002', 'Mia', null, 14)
on conflict do nothing;

insert into special_prices (id, customer_id, product_id, min_qty, price_cents, valid_from, valid_to, reason, status, approved_by) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 1, 11200, current_date - 150, current_date + 20, 'Fleet supply agreement 2026', 'approved', 'Sales manager'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 1, 720, current_date - 60, current_date + 300, 'Seasonal grease programme', 'approved', 'Sales manager'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 2990, current_date, current_date + 90, 'Match on new workshop fit-out', 'pending', null),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', 1, 7400, current_date - 400, current_date - 10, 'Distributor launch price', 'approved', 'Sales manager'),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000007', 1, 1390, current_date - 30, current_date + 30, 'Orchard season bulk gloves', 'approved', 'Sales manager')
on conflict do nothing;

-- Twelve months of invoiced sales. Canterbury's 5 L oil and Northshore's brake cleaner are sold under the
-- entitled price, and Otago is still invoiced at its expired coolant special.
insert into sales (customer_id, product_id, month, qty, revenue_cents, source)
select c.id, p.id, date_trunc('month', current_date - make_interval(months => m))::date, v.qty, v.qty * v.unit_cents, 'Demo ERP export'
from (values
  ('NTHWKS', 'OIL-1540-5L', 40, 3250), ('NTHWKS', 'CLN-BRAKE-400', 120, 600), ('NTHWKS', 'GLV-NIT-100', 30, 1550),
  ('WAIFLEET', 'OIL-1540-20L', 60, 11200), ('WAIFLEET', 'COOL-LL-20L', 8, 8900),
  ('CANTAG', 'OIL-1540-5L', 55, 3190), ('CANTAG', 'GRS-EP2-450', 96, 720), ('CANTAG', 'OIL-1540-20L', 12, 12900),
  ('OTAGODIST', 'COOL-LL-20L', 30, 7400), ('OTAGODIST', 'OIL-1540-5L', 80, 3050),
  ('BRISMECH', 'OIL-1540-5L', 25, 3190),
  ('HBORCH', 'GLV-NIT-100', 20, 1390), ('HBORCH', 'OIL-1540-20L', 6, 12300)
) as v(account, sku, qty, unit_cents)
cross join generate_series(1, 12) as m
join customers c on c.account = v.account join products p on p.sku = v.sku
on conflict do nothing;

insert into price_changes (id, name, effective_on, uplift_bps, lists, groups, status, created_by) values
  ('50000000-0000-4000-8000-000000000001', 'Oils increase, base oil surcharge', current_date + 45, 450, '{TRADE,WORKSHOP}', '{Oils}', 'draft', 'Aroha')
on conflict do nothing;

insert into notices (change_id, customer_id, notified_on, evidence, actor) values
  ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', current_date - 2, 'Price letter emailed by rep, reference PL-2611', 'Aroha')
on conflict do nothing;

insert into discount_requests (id, customer_id, product_id, price_cents, qty, reason, requested_by) values
  ('60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 11000, 40, 'Harvest tender, competing quote on 40 drums', 'Lee')
on conflict do nothing;
