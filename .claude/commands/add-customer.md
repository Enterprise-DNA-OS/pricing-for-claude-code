---
description: Add a customer account on a price list, with their rep and the notice period in their terms.
---

Run: `npm run price -- add-customer --account= --name= --list= --rep= --email= --notice-days= --actor=`

Ask for the notice period in their terms of trade if it is not given; 30 days is only the default.

Options use --name=value. Add --json for structured output. Show money with its currency and margins as percentages. Drafts go to drafts/ and are never sent from here.
