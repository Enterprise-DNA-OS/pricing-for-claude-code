---
description: Record a new cost for a product from a supplier price file or landed cost.
---

Run: `npm run price -- cost <sku> --cost= --currency= --from=YYYY-MM-DD --source= --actor=`

Costs are history: a new cost is a new row. Then run /cost-moves to see which prices it puts under the floor.

Options use --name=value. Add --json for structured output. Show money with its currency and margins as percentages. Drafts go to drafts/ and are never sent from here.
