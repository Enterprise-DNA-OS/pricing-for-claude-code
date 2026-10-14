---
description: Bring a Pricefx price list export or an ERP sales report across.
---

Run: `npm run price -- import pricefx <list> --file= --from=YYYY-MM-DD --actor= --dry-run`

Always dry run first and show the counts. Imported prices land as drafts: review /margins, then /approve-list. For sales: npm run price -- import sales --file= --actor=. Read docs/replace-pricefx.md.

Options use --name=value. Add --json for structured output. Show money with its currency and margins as percentages. Drafts go to drafts/ and are never sent from here.
