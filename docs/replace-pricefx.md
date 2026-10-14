# Move your price book from Pricefx

Sources checked 14 October 2026: [Export Pricefx Price List to CSV via FTP](https://knowledge.pricefx.com/platformmanager-documentation/reference-manual/marketplace-tab/marketplace-categories/integration/integration-templates-documentation/export-pricefx-price-list-to-csv-via-ftp).

Pricefx documents an integration template that writes an approved price list to CSV. A SIMPLE price list always exports `sku` and `resultPrice`; a MATRIX price list adds `key2`. You can add more fields in the template. If your administrator exports by another route, any CSV with a product code and a price works with a mapping file.

## One command per list

1. Export each price list you want to keep, one file per list.
2. Create the list here if it does not exist (`/customise` adds a price list, or insert one row in `price_lists`), with its currency and audience.
3. Dry run: `npm run price -- import pricefx TRADE --file=imports/trade.csv --from=2026-11-01 --actor="Your name" --dry-run`
4. Run the same command without `--dry-run`. Prices land as drafts for that date.
5. Check them: `npm run price -- list TRADE` and `npm run price -- margins`.
6. Approve: `npm run price -- approve-list TRADE --from=2026-11-01 --actor="Your name"`. It stops on any price under the margin floor until you fix it or record a reason.

Headings that differ go in a mapping file: `--map=examples/import-map.json` with `sku`, `price` and `qty`. `key2` is read as the quantity break. If your matrix uses `key2` for a customer or region, it needs mapping to special prices or separate lists first; that is part of what Enterprise DNA does when it brings your data across.

## What else to bring

- Costs: `npm run price -- cost <sku> --cost= --currency= --from= --source=` per product, or a migration that loads your supplier price file.
- Customers and their list: `add-customer`, with the notice period from your terms of trade.
- Special prices: `special` per agreement, then `approve-special`. Every special needs an end date.
- Sales history for leakage and change impact: `npm run price -- import sales --file=sales.csv --actor=` with `account, sku, month (YYYY-MM), qty, revenue` from your ERP's sales report.

An import is all or nothing: one bad row rolls the whole file back. Re-importing the same file changes nothing. A different price for the same product, break and date is refused for review, never overwritten.

## What does not carry over

Pricefx's optimisation models, price waterfalls, quote workflows, rebate agreements, approval chains and its connection to your ERP do not come across through a price list export. The free version reads your ERP's reports; it does not write prices back to the ERP. Enterprise DNA scopes the ERP connection, approval rules and any screens for your version.
