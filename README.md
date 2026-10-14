<h1 align="center">Pricing for Claude Code</h1>

<p align="center">
  <strong>The open-source price management system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Pricefx data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=pricefx">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/pricefx?utm_source=github&utm_medium=readme&utm_campaign=pricefx">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-pricefx">Instead of Pricefx</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Pricing for Claude Code does the job you pay Pricefx for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it answers your own questions against your own records.

Pricefx does not publish a price list. Its own learning-centre article, archived in May 2024, described subscriptions priced on the revenue the software manages, with implementation projects on top ([docs/research.md](docs/research.md)). Most NZ and Australian distributors never buy software at that level and run their price book in the ERP and spreadsheets instead. This gives them the same weekly work in a database they own.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=pricefx).

It is for wholesalers, distributors and manufacturers who sell to trade customers off price lists: costs, list prices and quantity breaks, customer special prices with end dates, margin floors by product group, price rises with the notice your terms promise, discount approvals, and the leakage between what customers should pay and what they were invoiced. The demo is a New Zealand lubricants and workshop supplies distributor with an Australian trade list.

## Ten questions your own version answers

Each one is a command that works today on the demo data.

- Which prices fell under the margin floor after the last supplier cost rise? `/below-floor`
- Which cost rises have not been passed through to any price list yet? `/cost-moves`
- How much did each rep invoice below the entitled price last quarter? `/leakage-by-rep`
- Which customers are still invoiced at a special price that has already ended? `/leakage`
- What is a 4.5% rise on oils worth over twelve months, before it goes out? `/change`
- Which customers cannot be given the notice period in their terms before the next rise? `/notices-due`
- Which special prices end in the next six weeks, and what does each customer go back to? `/specials-expiring`
- What does this customer pay for 12 drums today, and does it clear the floor? `/price`
- Which discount requests would leave less than the floor, and who asked? `/requests`
- Which recommended retail lists are missing GST-inclusive pricing or the reseller statement? `/compliance`

## Your first hour: ten things to ask for

1. Put our business name and logo on the customer price lists.
2. Show every price under the margin floor, worst first.
3. Which supplier cost rises have we not passed on yet?
4. Draft a 4.5% rise on oils for Trade and Workshop from the first of next month and tell me what it is worth.
5. Which customers need notice of that rise, and by when?
6. Load our Pricefx Trade list export as a dry run.
7. Where did we invoice under the agreed price last quarter, by rep?
8. List the special prices ending in the next six weeks.
9. Add a minimum order quantity to every product.
10. Our floor for filters is 28%, not 25%. Change it.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/pricing-for-claude-code.git
cd pricing-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`: everything in the demo price book that needs a person this week. `npm test` runs every command against a throwaway database.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | The one list of everything in the price book that needs a person this week. |
| `/weekly-review` | The Monday pricing review. |
| `/cost-moves` | Products whose cost moved more than the policy threshold, and whether their price was reviewed since. |
| `/below-floor` | Every list price and approved special sitting under its margin floor. |
| `/margins` | Every live price with its cost, margin, floor and target, worst first. |
| `/leakage` | Where invoiced prices fell below what each customer was entitled to pay. |
| `/leakage-by-rep` | Price leakage totalled by rep and currency. |
| `/specials` | Every customer special price with its margin, end date and approval. |
| `/specials-expiring` | Specials ending inside the warning window, so the rep can renew, reprice or let them lapse. |
| `/requests` | Discount requests waiting for a decision, with the margin each would leave. |
| `/changes` | Every price change, its status, effective date, lines and open notices. |
| `/change` | One price change: every line old and new, the new margins, twelve months of revenue impact and the notice status of each customer. |
| `/notices-due` | Customers still to be told about a price change, with the date their terms require notice by. |
| `/compliance` | Check the price book against the rules in docs/compliance.md. |
| `/price` | What a customer pays for a product at a quantity today, and the margin it leaves. |
| `/customer` | One customer: their price list, what they pay for each product today, specials and recent sales. |
| `/product` | One product: cost history, price on every list with margin, and specials. |
| `/list` | One price list: every price, break and draft. |
| `/lists` | List every price list, its currency, audience and how many customers sit on it. |
| `/customers` | List customers with their price list, rep and the notice period in their terms. |
| `/products` | List active products with today's cost. |
| `/policy` | The policy numbers and margin floors the checks use. |
| `/history` | The audit trail: every change, who made it, with what. |
| `/add-product` | Add a product to the price book. |
| `/cost` | Record a new cost for a product from a supplier price file or landed cost. |
| `/set-price` | Set one list price, optionally for a quantity break, from a date. |
| `/approve-list` | Approve the draft prices on a list for a date, after a margin check. |
| `/add-customer` | Add a customer account on a price list, with their rep and the notice period in their terms. |
| `/assign-list` | Move a customer onto a different price list. |
| `/special` | Record a special price for one customer and product, with an end date and a reason. |
| `/approve-special` | Approve a pending special price. |
| `/retire-special` | End a special price early. |
| `/request-discount` | A rep asks for a price for one deal. |
| `/decide` | Approve or decline a discount request. |
| `/change-new` | Draft a price change: a percentage across lists and product groups from a date. |
| `/change-approve` | Approve a drafted price change. |
| `/notice` | Record that a customer was told about a price change, with the evidence. |
| `/change-apply` | Write an approved price change into the price lists from its effective date. |
| `/change-cancel` | Cancel a draft or approved price change. |
| `/draft-notice` | Draft the price change letter for one customer. |
| `/draft-review` | Write the weekly pricing review to drafts/. |
| `/import` | Bring a Pricefx price list export or an ERP sales report across. |
| `/export` | Write every record to one JSON file. |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |

Every command runs `npm run price -- <command>` underneath. `npm run price -- help` prints the exact syntax. Add `--json` to any command for structured output. Names match without regard to case; an ambiguous name lists the candidates and exits 1.

Every change takes `--actor` and lands in an append-only audit table. Costs and customer notices are history: they cannot be edited or deleted through ordinary database operations. The person who drafts a price change cannot approve it, and the rep who asks for a discount cannot decide it.

## How prices work

Money is stored in whole cents and margins in basis points. Each price list has one currency; margins compare a price with today's cost in the same currency. A customer pays the deepest quantity break on their list at or under the quantity, or an approved special that is in date and lower. Pending or retired specials never count. A new list price ends the old one the day before it starts, so history stays. A price change writes new prices from its effective date and stops while any customer on an affected list has not been notified within the period in their terms.

Leakage is the entitled price times quantity, less invoiced revenue, over the last three months of imported sales. It reads sales by month, so a special that changed mid-month shows as an average.

## Documents and views

`npm run docs` writes each customer's price list (with breaks and specials), the recommended retail lists and a brief for every open price change, in your brand from `brand.json`, to `docs-out/`. `npm run view` writes the week, leakage and price book pages to `views/`. `/new-view` adds another.

## Record checks

`/compliance` checks notice periods against your terms, GST-inclusive consumer lists, the reseller statement on recommended retail lists, and your own policies on approvals, margin floors and stale costs. The sources are in [docs/compliance.md](docs/compliance.md). It is not legal advice.

## Instead of Pricefx

Pricefx documents a price list CSV export: `sku` and `resultPrice`, plus `key2` on matrix lists. One command per list, dry run first:

```bash
npm run price -- import pricefx DIST --file=examples/pricefx-price-list.csv --from=2026-12-01 --actor="Your name" --dry-run
npm run price -- import pricefx DIST --file=examples/pricefx-price-list.csv --from=2026-12-01 --actor="Your name"
npm run price -- approve-list DIST --from=2026-12-01 --actor="Your name"
```

Imported prices land as drafts and are approved after a margin check. Sales history comes from any ERP sales report with `npm run price -- import sales`. The example file is synthetic. Full guide, including what does not carry over: [docs/replace-pricefx.md](docs/replace-pricefx.md).

## Architecture

```
pricing-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table and house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Pricing for Claude Code for your business, migrates your Pricefx data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=pricefx)
- Read more: [enterprisedna.co/omni/instead-of/pricefx](https://enterprisedna.co/omni/instead-of/pricefx?utm_source=github&utm_medium=readme&utm_campaign=pricefx)

## License

MIT. Copyright (c) 2026 Enterprise DNA. Not affiliated with Pricefx or Anthropic.
