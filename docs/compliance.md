# Price book record checks

`/compliance` runs `npm run price -- compliance`. It checks the records against the rules below and lists what it finds. It is not legal advice and does not certify that your pricing complies with any law. Sources checked 14 October 2026. Confirm the rules that apply to your contracts and markets with your adviser, then change the checks with `/customise`.

| Rule | What the check finds | Basis |
|---|---|---|
| PM01 | A price change takes effect before the notice period recorded for a customer can be met, or the notice was recorded late. | The notice period is the one in your own terms of trade, recorded per customer as `notice_days`. Regulators in both countries name terms letting a supplier change prices without notice as examples of possibly unfair terms in standard form business contracts. |
| PM02 | A price list for consumers is not marked GST inclusive. | Australian Consumer Law section 48: a price shown to consumers must include the single total, GST included. In New Zealand, misleading price presentation breaches the Fair Trading Act 1986. |
| PM03 | A recommended retail list has no statement that resellers set their own prices. | Resale price maintenance is prohibited in both countries. A supplier can recommend a price but cannot enforce it or set a minimum. |
| PM04 | A special price is waiting for approval. | Your policy. Pending specials do not count in any price until approved. |
| PM05 | A live list price or approved special sits under the margin floor for its product group. | Your policy, in `margin_rules`. |
| PM06 | An active product has no cost recorded in the last 180 days. | Your policy, `stale_cost_days` in `policy`. |

## Sources

- PM01, Australia: [ACCC proceedings against JJ Richards](https://www.accc.gov.au/media-release/accc-takes-jj-richards-to-court-over-alleged-unfair-contract-terms) challenged a term letting the supplier change prices during the contract on its own. Penalties for unfair terms in standard form contracts with small businesses apply from 9 November 2023.
- PM01, New Zealand: [Commerce Commission, unfair contract terms](https://comcom.govt.nz/business/your-rights-as-a-business/unfair-contract-terms). Since 16 August 2022 the rules cover standard form small trade contracts, trading relationships up to $250,000 in a 12-month period, and the Commission lists terms that let a supplier change the price on its own as an example.
- PM02, Australia: [ACCC, component pricing](https://www.accc.gov.au/business/selling-products-and-services/small-business-toolkit/pricing-and-unfair-selling-practices/component-pricing). Business-to-business prices can be shown plus GST; consumer prices need the total.
- PM02, New Zealand: [Fair Trading Act 1986](https://www.legislation.govt.nz/act/public/1986/0121/latest/DLM96915.html), and the Commission's warning that [reasons for price increases must not be misrepresented](https://www.comcom.govt.nz/news-and-media/news-and-events/archive/reasons-for-price-increases-must-not-be-misrepresented/). The drafted notice letter gives no reason for a rise. If you add one, it must be true.
- PM03, Australia: [ACCC, minimum resale prices](https://www.accc.gov.au/business/competition-and-exemptions/minimum-resale-prices). Suppliers can provide a recommended price list and set a maximum price, but cannot enforce a minimum.
- PM03, New Zealand: [Commerce Commission, resale price maintenance](https://comcom.govt.nz/business/avoiding-anti-competitive-behaviour/resale-price-maintenance) under the [Commerce Act 1986](https://www.legislation.govt.nz/act/public/1986/0005/latest/DLM88442.html). A supplier can recommend a price but cannot do anything to enforce it.

## What the checks do not do

They do not read your contracts. The notice period is whatever you record per customer. They do not check how resellers are treated after an RRP list goes out, whether a price change was coordinated with anyone, or what goes on a shelf ticket. Never record or share competitors' prices or price plans with other suppliers through this system. Margins compare today's price with today's recorded cost in the same currency; a product with no cost in that currency shows no margin.

Policy numbers live in the `policy` and `margin_rules` tables. Change them through a migration with `/customise`, so the history shows when a rule changed.
