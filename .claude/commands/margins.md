---
description: Every live price with its cost, margin, floor and target, worst first.
---

Run: `npm run price -- margins`

Lead with prices under the floor, then under target. Margin is price less today's cost, as a share of price, in the list currency.

Options use --name=value. Add --json for structured output. Show money with its currency and margins as percentages. Drafts go to drafts/ and are never sent from here.
