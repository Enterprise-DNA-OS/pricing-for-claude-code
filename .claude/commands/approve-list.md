---
description: Approve the draft prices on a list for a date, after a margin check.
---

Run: `npm run price -- approve-list <list> --from=YYYY-MM-DD --actor=`

If any draft sits under the floor the command stops and lists them. Only pass --below-floor-ok with the reason the operator gives.

Options use --name=value. Add --json for structured output. Show money with its currency and margins as percentages. Drafts go to drafts/ and are never sent from here.
