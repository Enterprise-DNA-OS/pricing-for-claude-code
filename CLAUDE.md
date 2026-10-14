# Pricing for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS] (the demo is Harbour Lubricants and Supplies, a distributor)
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| the one list of everything in the price book that needs a person this week | `/attention` |
| the Monday pricing review | `/weekly-review` |
| products whose cost moved more than the policy threshold, and whether their price was reviewed since | `/cost-moves` |
| every list price and approved special sitting under its margin floor | `/below-floor` |
| every live price with its cost, margin, floor and target, worst first | `/margins` |
| where invoiced prices fell below what each customer was entitled to pay | `/leakage` |
| price leakage totalled by rep and currency | `/leakage-by-rep` |
| every customer special price with its margin, end date and approval | `/specials` |
| specials ending inside the warning window, so the rep can renew, reprice or let them lapse | `/specials-expiring` |
| discount requests waiting for a decision, with the margin each would leave | `/requests` |
| every price change, its status, effective date, lines and open notices | `/changes` |
| one price change: every line old and new, the new margins, twelve months of revenue impact and the notice status of each customer | `/change` |
| customers still to be told about a price change, with the date their terms require notice by | `/notices-due` |
| check the price book against the rules in docs/compliance.md | `/compliance` |
| what a customer pays for a product at a quantity today, and the margin it leaves | `/price` |
| one customer: their price list, what they pay for each product today, specials and recent sales | `/customer` |
| one product: cost history, price on every list with margin, and specials | `/product` |
| one price list: every price, break and draft | `/list` |
| list every price list, its currency, audience and how many customers sit on it | `/lists` |
| list customers with their price list, rep and the notice period in their terms | `/customers` |
| list active products with today's cost | `/products` |
| the policy numbers and margin floors the checks use | `/policy` |
| the audit trail: every change, who made it, with what | `/history` |
| add a product to the price book | `/add-product` |
| record a new cost for a product from a supplier price file or landed cost | `/cost` |
| set one list price, optionally for a quantity break, from a date | `/set-price` |
| approve the draft prices on a list for a date, after a margin check | `/approve-list` |
| add a customer account on a price list, with their rep and the notice period in their terms | `/add-customer` |
| move a customer onto a different price list | `/assign-list` |
| record a special price for one customer and product, with an end date and a reason | `/special` |
| approve a pending special price | `/approve-special` |
| end a special price early | `/retire-special` |
| a rep asks for a price for one deal | `/request-discount` |
| approve or decline a discount request | `/decide` |
| draft a price change: a percentage across lists and product groups from a date | `/change-new` |
| approve a drafted price change | `/change-approve` |
| record that a customer was told about a price change, with the evidence | `/notice` |
| write an approved price change into the price lists from its effective date | `/change-apply` |
| cancel a draft or approved price change | `/change-cancel` |
| draft the price change letter for one customer | `/draft-notice` |
| write the weekly pricing review to drafts/ | `/draft-review` |
| bring a Pricefx price list export or an ERP sales report across | `/import` |
| write every record to one JSON file | `/export` |
| make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it | `/customise` |
| add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view` | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run <cli> -- --help`) and then propose a new command for it.

## Hard rules

- Every change takes `--actor` with the operator's name. Never fill it with your own.
- Never pass `--below-floor-ok` unless the operator gave the reason in this session, and use their words.
- Never work around a blocked `change-apply` or `draft-notice`. Report the reason and the fix.
- Never record or compare competitors' price plans, and never draft anything that tells a reseller what to sell at. Recommended prices are recommendations.
- Read `/customer` before a special, discount or notice for that customer.

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Pricefx.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/pricefx
