-- Pricing for Claude Code: the price book of a distributor or manufacturer.
-- Money is integer cents, margins are basis points (1% = 100 bps). One currency per price list.
create function touch_updated() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (length(trim(sku)) > 0),
  name text not null check (length(trim(name)) > 0),
  product_group text not null default 'General',
  unit text not null default 'each',
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Landed cost history. A new cost is a new row; the current cost is the latest effective one.
create table costs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  cost_cents bigint not null check (cost_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  effective_from date not null,
  source text not null check (length(trim(source)) > 0),
  actor text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (product_id, currency, effective_from)
);

create table price_lists (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]+$'),
  name text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  audience text not null default 'trade' check (audience in ('trade', 'distributor', 'consumer')),
  recommended_retail boolean not null default false,
  gst_inclusive boolean not null default false,
  resale_statement text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- One row per product, quantity break and validity window. Draft rows are proposals, not prices.
create table list_prices (
  id uuid primary key default gen_random_uuid(),
  price_list_id uuid not null references price_lists(id),
  product_id uuid not null references products(id),
  min_qty integer not null default 1 check (min_qty >= 1),
  price_cents bigint not null check (price_cents > 0),
  valid_from date not null,
  valid_to date,
  status text not null default 'approved' check (status in ('draft', 'approved', 'retired')),
  source text not null default 'manual',
  change_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create unique index one_price_per_break on list_prices(price_list_id, product_id, min_qty, valid_from) where status <> 'retired';

create table customers (
  id uuid primary key default gen_random_uuid(),
  account text not null unique check (length(trim(account)) > 0),
  name text not null check (length(trim(name)) > 0),
  price_list_id uuid not null references price_lists(id),
  rep text not null default 'Unassigned',
  email text,
  notice_days integer not null default 30 check (notice_days between 0 and 365),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Customer special prices. Every special has an end date and a named approver before it counts.
create table special_prices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  product_id uuid not null references products(id),
  min_qty integer not null default 1 check (min_qty >= 1),
  price_cents bigint not null check (price_cents > 0),
  valid_from date not null,
  valid_to date not null,
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'retired')),
  approved_by text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (valid_to >= valid_from),
  check (status <> 'approved' or length(trim(approved_by)) > 0)
);

-- Margin floor and target by product group; '*' is the default for every group.
create table margin_rules (
  id uuid primary key default gen_random_uuid(),
  product_group text not null unique,
  floor_bps integer not null check (floor_bps between -10000 and 10000),
  target_bps integer not null check (target_bps between -10000 and 10000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (target_bps >= floor_bps)
);

-- Invoiced sales by month, imported from the ERP. The source of volume and realised price.
create table sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  product_id uuid not null references products(id),
  month date not null check (extract(day from month) = 1),
  qty numeric(14, 3) not null check (qty > 0),
  revenue_cents bigint not null check (revenue_cents >= 0),
  source text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (customer_id, product_id, month)
);

-- A price change: one uplift across chosen lists and groups, an effective date, notices, then live.
create table price_changes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  effective_on date not null,
  uplift_bps integer not null check (uplift_bps between -5000 and 5000),
  lists text[] not null,
  groups text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'approved', 'live', 'cancelled')),
  approved_by text,
  created_by text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status in ('draft', 'cancelled') or length(trim(approved_by)) > 0)
);
alter table list_prices add constraint list_prices_change_fk foreign key (change_id) references price_changes(id);

-- When each customer was told about a change, and the evidence. Recorded by a person, never sent from here.
create table notices (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null references price_changes(id),
  customer_id uuid not null references customers(id),
  notified_on date not null,
  evidence text not null check (length(trim(evidence)) > 0),
  actor text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (change_id, customer_id)
);

-- A rep asks for a price under the floor. Someone with authority says yes or no.
create table discount_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  product_id uuid not null references products(id),
  price_cents bigint not null check (price_cents > 0),
  qty integer not null default 1 check (qty >= 1),
  reason text not null check (length(trim(reason)) > 0),
  requested_by text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by text,
  decision_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status = 'pending' or (length(trim(decided_by)) > 0 and length(trim(decision_note)) > 0))
);

create table audit (
  id uuid primary key default gen_random_uuid(),
  action text not null, record_id uuid, actor text not null, detail jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table policy (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value integer not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into policy(key, value) values
  ('special_expiry_warning_days', 45),
  ('stale_cost_days', 180),
  ('leakage_months', 3),
  ('cost_move_bps', 300);

do $$ declare t text; begin
  foreach t in array array['products','costs','price_lists','list_prices','customers','special_prices','margin_rules','sales','price_changes','notices','discount_requests','audit','policy'] loop
    execute format('create trigger touch before update on %I for each row execute function touch_updated()', t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public', t);
  end loop;
end $$;

create function protect_history() returns trigger language plpgsql as $$ begin raise exception 'History is append-only'; end $$;
create trigger immutable_audit before update or delete on audit for each row execute function protect_history();
create trigger immutable_costs before update or delete on costs for each row execute function protect_history();
create trigger immutable_notices before update or delete on notices for each row execute function protect_history();

-- ------------------------------------------------------------------ views

create view current_costs as
select distinct on (c.product_id, c.currency) c.product_id, c.currency, c.cost_cents, c.effective_from, c.source,
  (select c2.cost_cents from costs c2 where c2.product_id = c.product_id and c2.currency = c.currency and c2.effective_from < c.effective_from order by c2.effective_from desc limit 1) as previous_cost_cents
from costs c where c.effective_from <= current_date
order by c.product_id, c.currency, c.effective_from desc;

create view floors as
select p.id as product_id, coalesce(g.floor_bps, d.floor_bps) as floor_bps, coalesce(g.target_bps, d.target_bps) as target_bps
from products p
left join margin_rules g on g.product_group = p.product_group
left join margin_rules d on d.product_group = '*';

-- Every list price valid today, with its margin against today's cost in the same currency.
create view list_margins as
select l.code as list, l.currency, p.sku, p.name, p.product_group, lp.min_qty, lp.price_cents,
  cc.cost_cents,
  case when cc.cost_cents is null then null else ((lp.price_cents - cc.cost_cents) * 10000 / lp.price_cents)::int end as margin_bps,
  f.floor_bps, f.target_bps, lp.valid_from, lp.valid_to, lp.id, lp.price_list_id, lp.product_id, l.gst_inclusive
from list_prices lp
join price_lists l on l.id = lp.price_list_id
join products p on p.id = lp.product_id
left join current_costs cc on cc.product_id = p.id and cc.currency = l.currency
left join floors f on f.product_id = p.id
where lp.status = 'approved' and lp.valid_from <= current_date and (lp.valid_to is null or lp.valid_to >= current_date);

-- Specials with their margin and how long they have left.
create view special_work as
select s.id, c.account, c.name as customer, c.rep, p.sku, p.name as product, p.product_group, l.currency,
  s.min_qty, s.price_cents, s.valid_from, s.valid_to, (s.valid_to - current_date) as days_left, s.status, s.approved_by, s.reason,
  (select lm.price_cents from list_margins lm where lm.price_list_id = c.price_list_id and lm.product_id = p.id and lm.min_qty = 1 limit 1) as list_price_cents,
  cc.cost_cents,
  case when cc.cost_cents is null then null else ((s.price_cents - cc.cost_cents) * 10000 / s.price_cents)::int end as margin_bps,
  f.floor_bps, s.customer_id, s.product_id
from special_prices s
join customers c on c.id = s.customer_id
join price_lists l on l.id = c.price_list_id
join products p on p.id = s.product_id
left join current_costs cc on cc.product_id = p.id and cc.currency = l.currency
left join floors f on f.product_id = p.id
where s.status <> 'retired';

-- What each customer is entitled to pay today for one unit: an approved special in date, else their list price.
create view entitled_prices as
select c.id as customer_id, c.account, c.name as customer, c.rep, l.code as list, l.currency, p.id as product_id, p.sku, p.name as product,
  lm.price_cents as list_price_cents,
  sw.price_cents as special_cents,
  coalesce(sw.price_cents, lm.price_cents) as entitled_cents,
  case when sw.id is null then 'list' else 'special' end as basis
from customers c
join price_lists l on l.id = c.price_list_id
join products p on p.active
left join list_margins lm on lm.price_list_id = c.price_list_id and lm.product_id = p.id and lm.min_qty = 1
left join lateral (select s.id, s.price_cents from special_prices s where s.customer_id = c.id and s.product_id = p.id and s.status = 'approved' and s.min_qty = 1
  and s.valid_from <= current_date and s.valid_to >= current_date order by s.price_cents limit 1) sw on true
where lm.price_cents is not null or sw.price_cents is not null;

-- Realised price against entitlement over the leakage window. Leakage is money given away below the entitled price.
create view leakage as
select e.account, e.customer, e.rep, e.sku, e.product, e.currency, e.basis,
  sum(s.qty) as qty, sum(s.revenue_cents) as revenue_cents,
  (sum(s.revenue_cents) / sum(s.qty))::bigint as realised_cents,
  e.entitled_cents,
  greatest(0, (e.entitled_cents * sum(s.qty) - sum(s.revenue_cents)))::bigint as leakage_cents
from sales s
join entitled_prices e on e.customer_id = s.customer_id and e.product_id = s.product_id
where s.month >= (date_trunc('month', current_date) - make_interval(months => (select value from policy where key = 'leakage_months')))::date
group by e.account, e.customer, e.rep, e.sku, e.product, e.currency, e.basis, e.entitled_cents;

-- Products whose cost moved more than the policy threshold since the price list was last set.
create view cost_moves as
select p.sku, p.name, p.product_group, cc.currency, cc.previous_cost_cents, cc.cost_cents, cc.effective_from as cost_from,
  ((cc.cost_cents - cc.previous_cost_cents) * 10000 / cc.previous_cost_cents)::int as move_bps,
  (select max(lp.valid_from) from list_prices lp join price_lists l on l.id = lp.price_list_id where lp.product_id = p.id and l.currency = cc.currency and lp.status = 'approved' and lp.valid_from <= current_date) as price_set_on
from current_costs cc join products p on p.id = cc.product_id
where cc.previous_cost_cents is not null
  and abs((cc.cost_cents - cc.previous_cost_cents) * 10000 / cc.previous_cost_cents) >= (select value from policy where key = 'cost_move_bps');

-- Every line a price change would write: each approved price still in force on the effective date,
-- uplifted and rounded to the cent, with its new margin and twelve months of volume behind it.
create view change_lines as
select ch.id as change_id, ch.name as change, ch.status, ch.effective_on, l.code as list, l.currency, p.sku, p.name as product, p.product_group,
  lp.min_qty, lp.price_cents as old_cents, x.new_cents, cc.cost_cents,
  case when cc.cost_cents is null then null else ((x.new_cents - cc.cost_cents) * 10000 / x.new_cents)::int end as new_margin_bps,
  coalesce((select sum(s.qty) from sales s join customers c on c.id = s.customer_id where c.price_list_id = l.id and s.product_id = p.id
    and s.month >= (date_trunc('month', current_date) - interval '12 months')::date
    and not exists (select 1 from special_prices sp where sp.customer_id = c.id and sp.product_id = p.id and sp.status = 'approved' and sp.valid_to >= ch.effective_on)), 0) as qty_12m,
  lp.id as list_price_id, l.id as price_list_id, p.id as product_id
from price_changes ch
join price_lists l on l.code = any(ch.lists)
join list_prices lp on lp.price_list_id = l.id and lp.status = 'approved' and lp.valid_from < ch.effective_on and (lp.valid_to is null or lp.valid_to >= ch.effective_on)
join products p on p.id = lp.product_id
cross join lateral (select (round(lp.price_cents * (10000 + ch.uplift_bps) / 10000.0))::bigint as new_cents) x
left join current_costs cc on cc.product_id = p.id and cc.currency = l.currency
where cardinality(ch.groups) = 0 or p.product_group = any(ch.groups);

-- Who must be told about each open change, and whether their notice period is met.
create view notice_work as
select ch.id as change_id, ch.name as change, ch.status, ch.effective_on, c.id as customer_id, c.account, c.name as customer, c.rep, c.email, c.notice_days,
  n.notified_on, (ch.effective_on - c.notice_days) as notify_by,
  case when n.notified_on is null and current_date > ch.effective_on - c.notice_days then 'late: notice period can no longer be met'
       when n.notified_on is null then 'to notify'
       when n.notified_on > ch.effective_on - c.notice_days then 'notified late'
       else 'notified' end as notice_state
from price_changes ch
join price_lists l on l.code = any(ch.lists)
join customers c on c.price_list_id = l.id
left join notices n on n.change_id = ch.id and n.customer_id = c.id
where ch.status in ('draft', 'approved');

create view compliance_findings as
  select account as ref, change as subject, 'PM01' as rule, 'Notice period in the customer terms: ' || notice_state as finding
    from notice_work where notice_state in ('late: notice period can no longer be met', 'notified late')
  union all select code, name, 'PM02', 'Consumer price list is not marked GST inclusive' from price_lists where audience = 'consumer' and not gst_inclusive
  union all select code, name, 'PM03', 'Recommended retail list has no statement that resellers set their own prices' from price_lists where recommended_retail and coalesce(trim(resale_statement), '') = ''
  union all select account || ' ' || sku, customer, 'PM04', 'Special price is not approved' from special_work where status = 'pending'
  union all select account || ' ' || sku, customer, 'PM05', 'Approved special sits below the margin floor' from special_work where status = 'approved' and margin_bps < floor_bps and valid_to >= current_date
  union all select list || ' ' || sku, name, 'PM05', 'List price sits below the margin floor' from list_margins where margin_bps < floor_bps
  union all select p.sku, p.name, 'PM06', 'No cost recorded in the last ' || (select value from policy where key = 'stale_cost_days') || ' days'
    from products p where p.active and not exists (select 1 from costs c where c.product_id = p.id and c.effective_from >= current_date - (select value from policy where key = 'stale_cost_days'));
