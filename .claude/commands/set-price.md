---
description: Set one list price, optionally for a quantity break, from a date.
---

Run: `npm run price -- set-price <list> <sku> --price= --from=YYYY-MM-DD [--min-qty=] [--draft] --actor=`

Show the margin it leaves. The previous price for the same break ends the day before. Use --draft when someone else approves.

Options use --name=value. Add --json for structured output. Show money with its currency and margins as percentages. Drafts go to drafts/ and are never sent from here.
