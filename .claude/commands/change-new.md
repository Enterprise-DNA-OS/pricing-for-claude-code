---
description: Draft a price change: a percentage across lists and product groups from a date.
---

Run: `npm run price -- change-new --name= --effective=YYYY-MM-DD --uplift=4.5 --lists=TRADE,WORKSHOP [--groups=Oils] --actor=`

Then run /change to show the lines, the revenue impact and which customers cannot be given their notice period in time.

Options use --name=value. Add --json for structured output. Show money with its currency and margins as percentages. Drafts go to drafts/ and are never sent from here.
