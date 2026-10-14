#!/usr/bin/env node
// The one CLI for the price book. Human tables by default, --json for machines.
//   npm run price -- help
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { table } from './lib/format.mjs';
import { parseCsv } from './lib/csv.mjs';

const pol = (k) => `(select value from policy where key='${k}')`;

export const reads = {
  products: 'select p.sku,p.name,p.product_group,p.unit,cc.currency,cc.cost_cents,cc.effective_from as cost_from from products p left join current_costs cc on cc.product_id=p.id where p.active order by p.product_group,p.sku,cc.currency',
  lists: "select l.code,l.name,l.currency,l.audience,l.gst_inclusive,l.recommended_retail,(select count(*) from list_margins m where m.price_list_id=l.id)::int as live_prices,(select count(*) from list_prices lp where lp.price_list_id=l.id and lp.status='draft')::int as drafts,(select count(*) from customers c where c.price_list_id=l.id)::int as customers from price_lists l order by l.currency,l.code",
  customers: 'select c.account,c.name,l.code as list,l.currency,c.rep,c.notice_days,c.email from customers c join price_lists l on l.id=c.price_list_id order by c.name',
  margins: 'select list,sku,min_qty,currency,price_cents,cost_cents,margin_bps,floor_bps,target_bps from list_margins order by (margin_bps-floor_bps) nulls first,list,sku,min_qty',
  'below-floor': "select 'list' as kind,list as who,sku,min_qty,currency,price_cents,cost_cents,margin_bps,floor_bps from list_margins where margin_bps<floor_bps union all select 'special',customer,sku,min_qty,currency,price_cents,cost_cents,margin_bps,floor_bps from special_work where status='approved' and valid_to>=current_date and margin_bps<floor_bps order by margin_bps",
  specials: 'select id,account,customer,sku,currency,min_qty,price_cents,list_price_cents,margin_bps,floor_bps,valid_to,days_left,status,approved_by from special_work order by valid_to,customer,sku',
  'specials-expiring': `select id,customer,rep,sku,currency,price_cents,list_price_cents,valid_to,days_left from special_work where status='approved' and days_left between 0 and ${pol('special_expiry_warning_days')} order by valid_to,customer`,
  'cost-moves': "select sku,name,currency,previous_cost_cents,cost_cents,move_bps,cost_from,price_set_on,case when price_set_on is null or price_set_on<cost_from then 'price not reviewed since cost moved' else 'price reviewed' end as state from cost_moves order by move_bps desc,sku",
  leakage: 'select account,customer,rep,sku,currency,basis,qty,entitled_cents,realised_cents,leakage_cents from leakage where leakage_cents>0 order by leakage_cents desc,customer',
  'leakage-by-rep': 'select rep,currency,count(*)::int as lines,sum(leakage_cents)::bigint as leakage_cents from leakage where leakage_cents>0 group by rep,currency order by sum(leakage_cents) desc',
  changes: "select ch.id,ch.name,ch.status,ch.effective_on,ch.uplift_bps,array_to_string(ch.lists,',') as lists,array_to_string(ch.groups,',') as groups,(select count(*) from change_lines cl where cl.change_id=ch.id)::int as lines,(select count(*) from notice_work n where n.change_id=ch.id and n.notice_state<>'notified')::int as notices_open from price_changes ch order by ch.effective_on,ch.name",
  'notices-due': "select change,effective_on,account,customer,rep,notice_days,notify_by,notified_on,notice_state from notice_work where notice_state<>'notified' order by notify_by,customer",
  requests: "select r.id,c.name as customer,p.sku,l.currency,r.qty,r.price_cents,cc.cost_cents,case when cc.cost_cents is null then null else ((r.price_cents-cc.cost_cents)*10000/r.price_cents)::int end as margin_bps,f.floor_bps,r.reason,r.requested_by,r.status from discount_requests r join customers c on c.id=r.customer_id join price_lists l on l.id=c.price_list_id join products p on p.id=r.product_id left join current_costs cc on cc.product_id=p.id and cc.currency=l.currency left join floors f on f.product_id=p.id where r.status='pending' order by r.created_at",
  attention: `select what,item,detail from (
    select 1 as ord,'cost moved, price not reviewed' as what,sku as item,currency||' cost '||round(previous_cost_cents/100.0,2)||' to '||round(cost_cents/100.0,2) as detail from cost_moves where price_set_on is null or price_set_on<cost_from
    union all select 2,'below margin floor',kind||' '||who||' '||sku,(margin_bps/100.0)::numeric(6,1)||'% vs floor '||(floor_bps/100.0)::numeric(6,1)||'%' from (select 'list' as kind,list as who,sku,margin_bps,floor_bps from list_margins where margin_bps<floor_bps union all select 'special',customer,sku,margin_bps,floor_bps from special_work where status='approved' and valid_to>=current_date and margin_bps<floor_bps) b
    union all select 3,'special expiring',customer||' '||sku,'ends '||valid_to||', '||days_left||' days' from special_work where status='approved' and days_left between 0 and ${pol('special_expiry_warning_days')}
    union all select 4,'special waiting for approval',customer||' '||sku,'requested price '||round(price_cents/100.0,2) from special_work where status='pending'
    union all select 5,'price change notice',customer||' / '||change,notice_state||', notify by '||notify_by from notice_work where notice_state<>'notified'
    union all select 6,'discount request',c.name||' '||p.sku,r.qty||' at '||round(r.price_cents/100.0,2)||', asked by '||r.requested_by from discount_requests r join customers c on c.id=r.customer_id join products p on p.id=r.product_id where r.status='pending'
    union all select 7,'price leakage',customer||' '||sku,currency||' '||round(leakage_cents/100.0,2)||' under entitled price' from leakage where leakage_cents>0
  ) a order by ord,item`,
  compliance: 'select rule,ref,subject,finding from compliance_findings order by rule,ref',
  history: 'select action,record_id,actor,detail,created_at from audit order by created_at,id',
  policy: "select key,value from policy union all select 'margin floor '||product_group,floor_bps from margin_rules order by 1",
};

export const usage = {
  ...Object.fromEntries(Object.keys(reads).map((k) => [k, k])),
  list: 'list <code>',
  customer: 'customer <account-or-name>',
  product: 'product <sku-or-name>',
  price: 'price <customer> <sku> [--qty=1]',
  change: 'change <name-or-id>',
  'weekly-review': 'weekly-review',
  'add-product': 'add-product --sku= --name= [--group=General] [--unit=each] --actor=',
  cost: 'cost <sku> --cost= --currency= --from=YYYY-MM-DD --source= --actor=',
  'set-price': 'set-price <list> <sku> --price= --from=YYYY-MM-DD [--min-qty=1] [--to=YYYY-MM-DD] [--draft] --actor=',
  'approve-list': 'approve-list <list> --from=YYYY-MM-DD [--below-floor-ok=<reason>] --actor=',
  'add-customer': 'add-customer --account= --name= --list= [--rep=] [--email=] [--notice-days=30] --actor=',
  'assign-list': 'assign-list <customer> --list= --actor=',
  special: 'special <customer> <sku> --price= --from=YYYY-MM-DD --to=YYYY-MM-DD --reason= [--min-qty=1] --actor=',
  'approve-special': 'approve-special <special-id> [--below-floor-ok=<reason>] --actor=',
  'retire-special': 'retire-special <special-id> --reason= --actor=',
  'request-discount': 'request-discount <customer> <sku> --price= --qty= --reason= --actor=',
  decide: 'decide <request-id> --decision=approved|declined --note= --actor=',
  'change-new': 'change-new --name= --effective=YYYY-MM-DD --uplift=4.5 --lists=TRADE,WORKSHOP [--groups=Oils] --actor=',
  'change-approve': 'change-approve <change> --actor=',
  notice: 'notice <change> <customer> --on=YYYY-MM-DD --evidence= --actor=',
  'change-apply': 'change-apply <change> --actor=',
  'change-cancel': 'change-cancel <change> --reason= --actor=',
  import: 'import pricefx <list> --file= --from=YYYY-MM-DD [--map=examples/import-map.json] [--dry-run] --actor=  |  import sales --file= --actor= [--dry-run]',
  export: 'export --file=exports/backup.json',
  'draft-notice': 'draft-notice <change> <customer> --actor=',
  'draft-review': 'draft-review --actor=',
};

const allowed = {
  price: ['qty'], 'add-product': ['sku', 'name', 'group', 'unit'], cost: ['cost', 'currency', 'from', 'source'],
  'set-price': ['price', 'from', 'min-qty', 'to', 'draft'], 'approve-list': ['from', 'below-floor-ok'],
  'add-customer': ['account', 'name', 'list', 'rep', 'email', 'notice-days'], 'assign-list': ['list'],
  special: ['price', 'from', 'to', 'reason', 'min-qty'], 'approve-special': ['below-floor-ok'], 'retire-special': ['reason'],
  'request-discount': ['price', 'qty', 'reason'], decide: ['decision', 'note'],
  'change-new': ['name', 'effective', 'uplift', 'lists', 'groups'], 'change-approve': [], notice: ['on', 'evidence'],
  'change-apply': [], 'change-cancel': ['reason'], import: ['file', 'from', 'map', 'dry-run'], export: ['file'],
  'draft-notice': [], 'draft-review': [],
};
const positional = {
  list: 1, customer: 1, product: 1, price: 2, change: 1, cost: 1, 'set-price': 2, 'approve-list': 1, 'assign-list': 1,
  special: 2, 'approve-special': 1, 'retire-special': 1, 'request-discount': 2, decide: 1, 'change-approve': 1,
  notice: 2, 'change-apply': 1, 'change-cancel': 1, 'draft-notice': 2,
};
const BOOLEAN = ['json', 'dry-run', 'draft'];

export function parse(args) {
  const opts = {}, pos = [];
  for (const a of args) {
    if (a.startsWith('--')) {
      const i = a.indexOf('=');
      const k = a.slice(2, i < 0 ? undefined : i);
      if (k in opts) throw Error(`Repeated --${k}`);
      opts[k] = i < 0 ? true : a.slice(i + 1);
    } else pos.push(a);
  }
  return { opts, pos };
}
const required = (o, k) => { const v = o[k]; if (typeof v !== 'string' || !v.trim()) throw Error(`--${k} is required`); return v.trim(); };
export function cents(v) {
  const s = String(v).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw Error('Money must be a positive decimal with at most two decimals, no currency symbols or separators');
  const [a, b = ''] = s.split('.');
  const n = Number(a) * 100 + Number(b.padEnd(2, '0'));
  if (!Number.isSafeInteger(n) || n <= 0 || n > 90000000000) throw Error('Amount must be above zero and below 900,000,000');
  return n;
}
export function bps(v) {
  const s = String(v).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw Error('Percent must be a number with at most two decimals, for example 4.5');
  const n = Math.round(Number(s) * 100);
  if (n < -5000 || n > 5000) throw Error('Percent change must be between -50 and 50');
  return n;
}
function date(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) throw Error('Use a valid YYYY-MM-DD date');
  return v;
}
function int(v, name, min = 1) {
  if (!/^\d+$/.test(String(v)) || Number(v) < min) throw Error(`--${name} must be a whole number of at least ${min}`);
  return Number(v);
}
function currency(v) { if (!/^[A-Z]{3}$/.test(v)) throw Error('Currency must be three uppercase letters'); return v; }
const tx = async (db, fn) => { await db.exec('BEGIN'); try { const r = await fn(); await db.exec('COMMIT'); return r; } catch (e) { await db.exec('ROLLBACK'); throw e; } };

// Exact id prefix or exact label first, then a case-insensitive contains match. More than one is an error with candidates.
async function resolve(db, sql, label, needle, what) {
  let rows = await db.query(`select * from (${sql}) r where r.id::text like $1 or lower(r.${label}::text)=lower($2) order by r.${label}`, [needle + '%', needle]);
  if (!rows.length) rows = await db.query(`select * from (${sql}) r where position(lower($1) in lower(r.${label}::text))>0 order by r.${label}`, [needle]);
  if (rows.length !== 1) {
    const err = Error(rows.length ? `Ambiguous ${what}; use the full id or code` : `No matching ${what}: ${needle}`);
    err.candidates = rows.map((r) => ({ id: r.id, [label]: r[label], ...(r.name && label !== 'name' ? { name: r.name } : {}) }));
    throw err;
  }
  return rows[0];
}
const customerSql = 'select c.*,l.code as list,l.currency from customers c join price_lists l on l.id=c.price_list_id';
const findCustomer = async (db, n) => {
  const byAccount = await db.query(`select * from (${customerSql}) c where lower(account)=lower($1)`, [n]);
  return byAccount.length === 1 ? byAccount[0] : resolve(db, customerSql, 'name', n, 'customer');
};
const findProduct = async (db, n) => {
  const bySku = await db.query('select * from products where lower(sku)=lower($1)', [n]);
  return bySku.length === 1 ? bySku[0] : resolve(db, 'select * from products', 'name', n, 'product');
};
const findList = async (db, code) => {
  const rows = await db.query('select * from price_lists where lower(code)=lower($1)', [code]);
  if (rows.length !== 1) { const e = Error(`No price list with code ${code}`); e.candidates = await db.query('select id,code,name from price_lists order by code'); throw e; }
  return rows[0];
};
const findChange = (db, n) => resolve(db, 'select * from price_changes', 'name', n, 'price change');
const audit = (db, action, id, actor, detail) => db.query('insert into audit(action,record_id,actor,detail) values($1,$2,$3,$4)', [action, id, actor, JSON.stringify(detail)]);
const today = async (db) => (await db.query('select current_date::text as d'))[0].d;

async function marginOf(db, productId, currencyCode, priceCents) {
  const r = (await db.query('select cc.cost_cents,f.floor_bps,f.target_bps from floors f left join current_costs cc on cc.product_id=f.product_id and cc.currency=$2 where f.product_id=$1', [productId, currencyCode]))[0] || {};
  const margin = r.cost_cents == null ? null : Math.trunc(((priceCents - Number(r.cost_cents)) * 10000) / priceCents);
  return { cost_cents: r.cost_cents == null ? null : Number(r.cost_cents), margin_bps: margin, floor_bps: r.floor_bps, target_bps: r.target_bps, below_floor: margin !== null && r.floor_bps != null && margin < r.floor_bps };
}

// The price a customer pays for a quantity today: the deepest list break at or under the quantity,
// or an approved special in date with its break met, whichever is lower.
async function quote(db, customer, product, qty) {
  const listRow = (await db.query('select min_qty,price_cents from list_margins where price_list_id=$1 and product_id=$2 and min_qty<=$3 order by min_qty desc limit 1', [customer.price_list_id, product.id, qty]))[0];
  const special = (await db.query("select id,min_qty,price_cents,valid_to from special_prices where customer_id=$1 and product_id=$2 and status='approved' and valid_from<=current_date and valid_to>=current_date and min_qty<=$3 order by price_cents limit 1", [customer.id, product.id, qty]))[0];
  if (!listRow && !special) throw Error(`${product.sku} has no price on ${customer.list} today and no special for ${customer.name}`);
  const useSpecial = special && (!listRow || Number(special.price_cents) <= Number(listRow.price_cents));
  const unit = Number(useSpecial ? special.price_cents : listRow.price_cents);
  const m = await marginOf(db, product.id, customer.currency, unit);
  return {
    customer: customer.name, list: customer.list, sku: product.sku, product: product.name, qty, currency: customer.currency,
    basis: useSpecial ? `special until ${special.valid_to}` : `${customer.list} list, break ${listRow.min_qty}+`,
    unit_cents: unit, total_cents: unit * qty, list_unit_cents: listRow ? Number(listRow.price_cents) : null,
    cost_cents: m.cost_cents, margin_bps: m.margin_bps, floor_bps: m.floor_bps, below_floor: m.below_floor,
  };
}

async function changeDetail(db, ch) {
  const lines = await db.query('select list,currency,sku,product_group,min_qty,old_cents,new_cents,cost_cents,new_margin_bps,qty_12m from change_lines where change_id=$1 order by list,sku,min_qty', [ch.id]);
  const impact = await db.query('select currency,count(*)::int as lines,sum(((new_cents-old_cents)*qty_12m))::bigint as revenue_12m_cents from change_lines where change_id=$1 and min_qty=1 group by currency order by currency', [ch.id]);
  const notices = await db.query('select account,customer,rep,notice_days,notify_by,notified_on,notice_state from notice_work where change_id=$1 order by notify_by,customer', [ch.id]);
  const change = (await db.query("select name,status,effective_on,uplift_bps,array_to_string(lists,',') as lists,array_to_string(groups,',') as groups,created_by,approved_by from price_changes where id=$1", [ch.id]))[0];
  return { change, lines, impact, notices };
}

async function detail(db, cmd, pos) {
  if (cmd === 'list') {
    const l = await findList(db, pos[0]);
    return { list: l, prices: await db.query("select p.sku,p.name,lp.min_qty,lp.price_cents,lp.valid_from,lp.valid_to,lp.status,lp.source from list_prices lp join products p on p.id=lp.product_id where lp.price_list_id=$1 and lp.status<>'retired' and (lp.valid_to is null or lp.valid_to>=current_date) order by p.sku,lp.min_qty,lp.valid_from", [l.id]) };
  }
  if (cmd === 'customer') {
    const c = await findCustomer(db, pos[0]);
    return {
      customer: { account: c.account, name: c.name, list: c.list, currency: c.currency, rep: c.rep, email: c.email, notice_days: c.notice_days },
      prices: await db.query('select sku,product,currency,list_price_cents,special_cents,entitled_cents,basis from entitled_prices where customer_id=$1 order by sku', [c.id]),
      specials: await db.query('select id,sku,price_cents,valid_from,valid_to,status,approved_by,reason from special_work where customer_id=$1 order by valid_to', [c.id]),
      sales_3m: await db.query(`select p.sku,sum(s.qty) as qty,sum(s.revenue_cents)::bigint as revenue_cents from sales s join products p on p.id=s.product_id where s.customer_id=$1 and s.month>=(date_trunc('month',current_date)-make_interval(months=>${pol('leakage_months')}))::date group by p.sku order by p.sku`, [c.id]),
    };
  }
  if (cmd === 'product') {
    const p = await findProduct(db, pos[0]);
    return {
      product: p,
      costs: await db.query('select currency,cost_cents,effective_from,source,actor from costs where product_id=$1 order by currency,effective_from', [p.id]),
      prices: await db.query('select list,currency,min_qty,price_cents,cost_cents,margin_bps,floor_bps from list_margins where product_id=$1 order by list,min_qty', [p.id]),
      specials: await db.query('select id,customer,price_cents,margin_bps,valid_to,status from special_work where product_id=$1 order by customer', [p.id]),
    };
  }
  return changeDetail(db, await findChange(db, pos[0]));
}

async function review(db) {
  const out = {};
  for (const k of ['cost-moves', 'below-floor', 'specials-expiring', 'notices-due', 'requests', 'leakage-by-rep', 'compliance']) out[k.replace(/-/g, '_')] = await db.query(reads[k]);
  return out;
}

function draftFile(name, content) {
  const dir = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${randomUUID().slice(0, 8)}.md`);
  fs.writeFileSync(file, content, { flag: 'wx' });
  return file;
}
const dollars = (c, cur) => `${cur} ${(Number(c) / 100).toFixed(2)}`;

export async function run(db, args) {
  const { opts: o, pos } = parse(args);
  const cmd = pos.shift() || 'help';
  if (cmd === 'help' || o.help) return Object.entries(usage).map(([command, syntax]) => ({ command, syntax }));
  if (!(cmd in usage)) throw Error(`Unknown command ${cmd}. Run help for the list.`);
  for (const f of BOOLEAN) if (f in o && o[f] !== true) throw Error(`--${f} is a flag without a value`);
  for (const k of Object.keys(o)) if (!['json', 'actor', ...(allowed[cmd] || [])].includes(k)) throw Error(`Unknown option --${k} for ${cmd}`);
  const want = cmd === 'import' ? (pos[0] === 'pricefx' ? 2 : 1) : positional[cmd] || 0;
  if (pos.length !== want) throw Error(`Usage: ${usage[cmd]}`);

  if (cmd in reads) return db.query(reads[cmd]);
  if (cmd === 'price') {
    return quote(db, await findCustomer(db, pos[0]), await findProduct(db, pos[1]), o.qty ? int(o.qty, 'qty') : 1);
  }
  if (['list', 'customer', 'product', 'change'].includes(cmd)) return detail(db, cmd, pos);
  if (cmd === 'weekly-review') return review(db);
  if (cmd === 'export') {
    const file = path.resolve(REPO_ROOT, required(o, 'file'));
    const data = await tx(db, async () => {
      const out = { version: 1, exported_at: new Date().toISOString() };
      for (const t of ['products', 'costs', 'price_lists', 'list_prices', 'customers', 'special_prices', 'margin_rules', 'sales', 'price_changes', 'notices', 'discount_requests', 'audit', 'policy']) out[t] = await db.query(`select * from ${t} order by id`);
      return out;
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    return { file, records: Object.values(data).filter(Array.isArray).reduce((n, a) => n + a.length, 0) };
  }

  const actor = required(o, 'actor');
  if (cmd === 'import') return pos[0] === 'pricefx' ? importPricefx(db, pos[1], o, actor) : pos[0] === 'sales' ? importSales(db, o, actor) : Promise.reject(Error('Import supports pricefx and sales'));
  if (cmd === 'draft-review') {
    const r = await review(db);
    return { file: draftFile('weekly-pricing-review', `# Weekly pricing review (draft)\n\nPrepared by ${actor} on ${await today(db)}. Internal. Nothing has been changed or sent.\n\n${human(r)}\n\nMargins compare today's price with today's recorded cost in the same currency. Leakage is entitled price times quantity, less invoiced revenue, over the policy window.\n`) };
  }
  if (cmd === 'draft-notice') {
    const ch = await findChange(db, pos[0]);
    const c = await findCustomer(db, pos[1]);
    if (ch.status !== 'approved') throw Error(`Draft blocked: change is ${ch.status}, approve it first`);
    const n = (await db.query('select * from notice_work where change_id=$1 and customer_id=$2', [ch.id, c.id]))[0];
    if (!n) throw Error(`Draft blocked: ${c.name} is not on a list this change touches`);
    if (n.notice_state.startsWith('late')) throw Error(`Draft blocked: ${c.name} needs ${c.notice_days} days notice and the change takes effect ${ch.effective_on}. Move the date or agree it with them first.`);
    if (!c.email) throw Error(`Draft blocked: no email recorded for ${c.name}`);
    const lines = await db.query('select sku,product,min_qty,old_cents,new_cents from change_lines where change_id=$1 and price_list_id=$2 and not exists (select 1 from special_prices sp where sp.customer_id=$3 and sp.product_id=change_lines.product_id and sp.status=$4 and sp.valid_to>=$5) order by sku,min_qty', [ch.id, c.price_list_id, c.id, 'approved', ch.effective_on]);
    const rows = lines.map((l) => `| ${l.sku} | ${l.product} | ${l.min_qty}+ | ${dollars(l.old_cents, c.currency)} | ${dollars(l.new_cents, c.currency)} |`).join('\n');
    const file = draftFile(`price-notice-${c.account.toLowerCase()}`, `# DRAFT: review before sending\n\nTo: ${c.email}\nSubject: Price update from ${ch.effective_on}\n\nHello ${c.name},\n\nFrom ${ch.effective_on} the following prices on your account change. Prices exclude GST.\n\n| Code | Product | Quantity | Current | From ${ch.effective_on} |\n|---|---|---|---|---|\n${rows}\n\nOrders invoiced before ${ch.effective_on} stay at current prices. Any special pricing agreed with you continues until its end date. Your account manager, ${c.rep}, can talk you through it.\n\nThank you for your business.\n\n## Internal\nPrepared by ${actor}. Notice period in their terms: ${c.notice_days} days, so notify by ${n.notify_by}. After sending, record it: npm run price -- notice "${ch.name}" ${c.account} --on=YYYY-MM-DD --evidence="..." --actor="${actor}"\n`);
    return { file, lines: lines.length };
  }

  return tx(db, async () => {
    let result, id;
    if (cmd === 'add-product') {
      result = (await db.query('insert into products(sku,name,product_group,unit) values($1,$2,$3,$4) returning *', [required(o, 'sku'), required(o, 'name'), o.group ? required(o, 'group') : 'General', o.unit ? required(o, 'unit') : 'each']))[0];
    } else if (cmd === 'cost') {
      const p = await findProduct(db, pos[0]);
      result = (await db.query('insert into costs(product_id,cost_cents,currency,effective_from,source,actor) values($1,$2,$3,$4,$5,$6) returning *', [p.id, cents(required(o, 'cost')), currency(required(o, 'currency')), date(required(o, 'from')), required(o, 'source'), actor]))[0];
    } else if (cmd === 'set-price') {
      const l = await findList(db, pos[0]), p = await findProduct(db, pos[1]);
      const from = date(required(o, 'from')), minQty = o['min-qty'] ? int(o['min-qty'], 'min-qty') : 1, to = o.to ? date(required(o, 'to')) : null;
      if (to && to < from) throw Error('--to is before --from');
      const status = o.draft ? 'draft' : 'approved';
      if (status === 'approved') {
        // End the open price for the same break the day before the new one starts.
        await db.query("update list_prices set valid_to=($4::date-1) where price_list_id=$1 and product_id=$2 and min_qty=$3 and status='approved' and valid_from<$4::date and (valid_to is null or valid_to>=$4::date)", [l.id, p.id, minQty, from]);
      }
      result = (await db.query('insert into list_prices(price_list_id,product_id,min_qty,price_cents,valid_from,valid_to,status,source) values($1,$2,$3,$4,$5,$6,$7,$8) returning *', [l.id, p.id, minQty, cents(required(o, 'price')), from, to, status, `set by ${actor}`]))[0];
      result.margin = await marginOf(db, p.id, l.currency, Number(result.price_cents));
    } else if (cmd === 'approve-list') {
      const l = await findList(db, pos[0]), from = date(required(o, 'from'));
      const drafts = await db.query("select lp.*,p.sku from list_prices lp join products p on p.id=lp.product_id where lp.price_list_id=$1 and lp.valid_from=$2 and lp.status='draft' order by p.sku,lp.min_qty", [l.id, from]);
      if (!drafts.length) throw Error(`No draft prices on ${l.code} from ${from}`);
      const below = [];
      for (const d of drafts) { const m = await marginOf(db, d.product_id, l.currency, Number(d.price_cents)); if (m.below_floor) below.push(`${d.sku} ${d.min_qty}+ at ${(m.margin_bps / 100).toFixed(1)}%`); }
      if (below.length && !(typeof o['below-floor-ok'] === 'string' && o['below-floor-ok'].trim())) throw Error(`Below the margin floor: ${below.join('; ')}. Fix them or pass --below-floor-ok="<reason>"`);
      for (const d of drafts) {
        await db.query("update list_prices set valid_to=($4::date-1) where price_list_id=$1 and product_id=$2 and min_qty=$3 and status='approved' and valid_from<$4::date and (valid_to is null or valid_to>=$4::date)", [l.id, d.product_id, d.min_qty, from]);
        await db.query("update list_prices set status='retired' where price_list_id=$1 and product_id=$2 and min_qty=$3 and status='approved' and valid_from=$4", [l.id, d.product_id, d.min_qty, from]);
      }
      await db.query("update list_prices set status='approved' where price_list_id=$1 and valid_from=$2 and status='draft'", [l.id, from]);
      id = l.id;
      result = { list: l.code, from, approved: drafts.length, below_floor: below };
    } else if (cmd === 'add-customer') {
      const l = await findList(db, required(o, 'list'));
      const email = o.email ? required(o, 'email') : null;
      if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw Error('Invalid email');
      result = (await db.query('insert into customers(account,name,price_list_id,rep,email,notice_days) values($1,$2,$3,$4,$5,$6) returning *', [required(o, 'account'), required(o, 'name'), l.id, o.rep ? required(o, 'rep') : 'Unassigned', email, o['notice-days'] ? int(o['notice-days'], 'notice-days', 0) : 30]))[0];
    } else if (cmd === 'assign-list') {
      const c = await findCustomer(db, pos[0]), l = await findList(db, required(o, 'list'));
      result = (await db.query('update customers set price_list_id=$2 where id=$1 returning *', [c.id, l.id]))[0];
    } else if (cmd === 'special') {
      const c = await findCustomer(db, pos[0]), p = await findProduct(db, pos[1]);
      const from = date(required(o, 'from')), to = date(required(o, 'to'));
      if (to < from) throw Error('--to is before --from');
      result = (await db.query('insert into special_prices(customer_id,product_id,min_qty,price_cents,valid_from,valid_to,reason) values($1,$2,$3,$4,$5,$6,$7) returning *', [c.id, p.id, o['min-qty'] ? int(o['min-qty'], 'min-qty') : 1, cents(required(o, 'price')), from, to, required(o, 'reason')]))[0];
      result.margin = await marginOf(db, p.id, c.currency, Number(result.price_cents));
    } else if (cmd === 'approve-special' || cmd === 'retire-special') {
      const s = await resolve(db, 'select * from special_work', 'id', pos[0], 'special price');
      if (cmd === 'approve-special') {
        if (s.status !== 'pending') throw Error(`Special is already ${s.status}`);
        if (s.margin_bps !== null && s.margin_bps < s.floor_bps && !(typeof o['below-floor-ok'] === 'string' && o['below-floor-ok'].trim())) throw Error(`Below the margin floor: ${(s.margin_bps / 100).toFixed(1)}% against ${(s.floor_bps / 100).toFixed(1)}%. Pass --below-floor-ok="<reason>" to approve anyway`);
        result = (await db.query("update special_prices set status='approved',approved_by=$2 where id=$1 returning *", [s.id, actor]))[0];
      } else {
        if (s.status === 'retired') throw Error('Special is already retired');
        required(o, 'reason');
        result = (await db.query("update special_prices set status='retired',valid_to=least(valid_to,greatest(valid_from,current_date)) where id=$1 returning *", [s.id]))[0];
      }
    } else if (cmd === 'request-discount') {
      const c = await findCustomer(db, pos[0]), p = await findProduct(db, pos[1]);
      result = (await db.query('insert into discount_requests(customer_id,product_id,price_cents,qty,reason,requested_by) values($1,$2,$3,$4,$5,$6) returning *', [c.id, p.id, cents(required(o, 'price')), int(required(o, 'qty'), 'qty'), required(o, 'reason'), actor]))[0];
      result.margin = await marginOf(db, p.id, c.currency, Number(result.price_cents));
    } else if (cmd === 'decide') {
      const r = await resolve(db, 'select * from discount_requests', 'id', pos[0], 'discount request');
      if (r.status !== 'pending') throw Error(`Request already ${r.status}`);
      const decision = required(o, 'decision');
      if (!['approved', 'declined'].includes(decision)) throw Error('Use --decision=approved or --decision=declined');
      if (r.requested_by === actor) throw Error('The person who asked cannot decide their own request');
      result = (await db.query('update discount_requests set status=$2,decided_by=$3,decision_note=$4 where id=$1 returning *', [r.id, decision, actor, required(o, 'note')]))[0];
    } else if (cmd === 'change-new') {
      const lists = required(o, 'lists').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      for (const code of lists) await findList(db, code);
      const groups = o.groups ? required(o, 'groups').split(',').map((s) => s.trim()).filter(Boolean) : [];
      for (const g of groups) if (!(await db.query('select 1 from products where product_group=$1', [g])).length) throw Error(`No products in group ${g}`);
      const eff = date(required(o, 'effective'));
      if (eff <= await today(db)) throw Error('A price change takes effect after today');
      result = (await db.query('insert into price_changes(name,effective_on,uplift_bps,lists,groups,created_by) values($1,$2,$3,$4,$5,$6) returning *', [required(o, 'name'), eff, bps(required(o, 'uplift')), lists, groups, actor]))[0];
    } else {
      const ch = await findChange(db, pos[0]);
      id = ch.id;
      if (cmd === 'change-approve') {
        if (ch.status !== 'draft') throw Error(`Change is ${ch.status}`);
        if (ch.created_by === actor) throw Error('The person who drafted the change cannot approve it');
        result = (await db.query("update price_changes set status='approved',approved_by=$2 where id=$1 returning *", [ch.id, actor]))[0];
      } else if (cmd === 'notice') {
        const c = await findCustomer(db, pos[1]);
        if (!['draft', 'approved'].includes(ch.status)) throw Error(`Change is ${ch.status}`);
        if (!(await db.query('select 1 from notice_work where change_id=$1 and customer_id=$2', [ch.id, c.id])).length) throw Error(`${c.name} is not on a list this change touches`);
        const on = date(required(o, 'on'));
        if (on > await today(db)) throw Error('A notice is recorded after it is sent, not before');
        result = (await db.query('insert into notices(change_id,customer_id,notified_on,evidence,actor) values($1,$2,$3,$4,$5) returning *', [ch.id, c.id, on, required(o, 'evidence'), actor]))[0];
      } else if (cmd === 'change-apply') {
        if (ch.status !== 'approved') throw Error(`Apply blocked: change is ${ch.status}`);
        const open = await db.query("select customer,notice_state from notice_work where change_id=$1 and notice_state<>'notified'", [ch.id]);
        if (open.length) { const e = Error(`Apply blocked: ${open.length} customer(s) not notified in time`); e.candidates = open; throw e; }
        const lines = await db.query('select * from change_lines where change_id=$1', [ch.id]);
        for (const l of lines) {
          await db.query("update list_prices set valid_to=($2::date-1) where id=$1 and (valid_to is null or valid_to>=$2::date)", [l.list_price_id, ch.effective_on]);
          await db.query("insert into list_prices(price_list_id,product_id,min_qty,price_cents,valid_from,status,source,change_id) values($1,$2,$3,$4,$5,'approved',$6,$7)", [l.price_list_id, l.product_id, l.min_qty, l.new_cents, ch.effective_on, `change: ${ch.name}`, ch.id]);
        }
        await db.query("update price_changes set status='live' where id=$1", [ch.id]);
        result = { change: ch.name, effective_on: ch.effective_on, prices_written: lines.length };
      } else if (cmd === 'change-cancel') {
        if (!['draft', 'approved'].includes(ch.status)) throw Error(`Change is ${ch.status}`);
        required(o, 'reason');
        result = (await db.query("update price_changes set status='cancelled' where id=$1 returning *", [ch.id]))[0];
      } else throw Error('Unimplemented command ' + cmd);
    }
    await audit(db, cmd, id || result.id, actor, { args: pos, ...o });
    return result;
  });
}

// Pricefx documents a price list CSV export: SIMPLE lists carry sku,resultPrice; MATRIX lists add key2.
// key2 is read as the quantity break. Customer-keyed matrices need mapping to special prices first.
const aliases = { sku: ['sku', 'Product ID', 'SKU'], price: ['resultPrice', 'Result Price', 'Price'], qty: ['key2', 'Quantity', 'Min Qty'] };
async function importPricefx(db, code, o, actor) {
  const l = await findList(db, code);
  const from = date(required(o, 'from'));
  const map = o.map ? JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, o.map), 'utf8')) : {};
  for (const [k, v] of Object.entries(map)) if (!(k in aliases) || typeof v !== 'string' || !v) throw Error('Invalid import mapping ' + k);
  const rows = parseCsv(fs.readFileSync(path.resolve(REPO_ROOT, required(o, 'file')), 'utf8'));
  if (!rows.length) throw Error('CSV contains no records');
  const value = (row, k) => {
    const names = map[k] ? [map[k]] : aliases[k];
    const hits = Object.keys(row).filter((h) => names.some((n) => n.toLowerCase() === h.toLowerCase()));
    if (hits.length > 1) throw Error('Ambiguous columns for ' + k);
    return hits.length ? String(row[hits[0]]).trim() : '';
  };
  const seen = new Set();
  const clean = rows.map((row, i) => {
    try {
      const sku = value(row, 'sku');
      if (!sku) throw Error('sku is empty');
      const qtyRaw = value(row, 'qty');
      const minQty = qtyRaw ? int(qtyRaw.replace(/\.0+$/, ''), 'key2') : 1;
      const price = cents(value(row, 'price'));
      const key = `${sku.toLowerCase()}|${minQty}`;
      if (seen.has(key)) throw Error('duplicate sku and quantity in this file');
      seen.add(key);
      return { sku, minQty, price, raw: row };
    } catch (e) { throw Error(`Row ${i + 2}: ${e.message}`); }
  });
  return tx(db, async () => {
    let added = 0, unchanged = 0, newProducts = 0;
    for (const r of clean) {
      let p = (await db.query('select * from products where lower(sku)=lower($1)', [r.sku]))[0];
      if (!p) { p = (await db.query("insert into products(sku,name,product_group) values($1,$1,'Imported') returning *", [r.sku]))[0]; newProducts++; }
      const same = (await db.query("select id,price_cents from list_prices where price_list_id=$1 and product_id=$2 and min_qty=$3 and valid_from=$4 and status<>'retired'", [l.id, p.id, r.minQty, from]))[0];
      if (same && Number(same.price_cents) === r.price) { unchanged++; continue; }
      if (same) throw Error(`${r.sku} ${r.minQty}+ already has a different price from ${from}; review before importing`);
      await db.query("insert into list_prices(price_list_id,product_id,min_qty,price_cents,valid_from,status,source) values($1,$2,$3,$4,$5,'draft',$6)", [l.id, p.id, r.minQty, r.price, from, `Pricefx export ${path.basename(o.file)}`]);
      added++;
    }
    await audit(db, 'import pricefx', l.id, actor, { list: l.code, from, file: path.basename(o.file), rows: clean.length, added, unchanged });
    if (o['dry-run']) { await db.exec('ROLLBACK'); await db.exec('BEGIN'); }
    return { list: l.code, from, rows: clean.length, added, unchanged, new_products: newProducts, dry_run: !!o['dry-run'], next: added ? `Imported prices are drafts. Review margins, then: npm run price -- approve-list ${l.code} --from=${from} --actor=<you>` : 'Nothing new' };
  });
}

// Invoiced sales by customer, product and month, from any ERP report saved as CSV.
async function importSales(db, o, actor) {
  const rows = parseCsv(fs.readFileSync(path.resolve(REPO_ROOT, required(o, 'file')), 'utf8'));
  if (!rows.length) throw Error('CSV contains no records');
  const pick = (row, ...names) => { const k = Object.keys(row).find((h) => names.some((n) => n.toLowerCase() === h.toLowerCase())); return k === undefined ? '' : String(row[k]).trim(); };
  return tx(db, async () => {
    let added = 0, unchanged = 0;
    for (const [i, row] of rows.entries()) {
      try {
        const c = (await db.query('select id from customers where lower(account)=lower($1)', [pick(row, 'account', 'customer account', 'Customer ID')]))[0];
        if (!c) throw Error('unknown customer account');
        const p = (await db.query('select id from products where lower(sku)=lower($1)', [pick(row, 'sku', 'product code', 'Item')]))[0];
        if (!p) throw Error('unknown sku');
        const m = pick(row, 'month', 'period');
        if (!/^\d{4}-\d{2}$/.test(m)) throw Error('month must be YYYY-MM');
        const qty = Number(pick(row, 'qty', 'quantity'));
        if (!(qty > 0)) throw Error('qty must be above zero');
        const revenue = cents(pick(row, 'revenue', 'net sales', 'amount'));
        const old = (await db.query('select qty,revenue_cents from sales where customer_id=$1 and product_id=$2 and month=$3', [c.id, p.id, `${m}-01`]))[0];
        if (old && Number(old.qty) === qty && Number(old.revenue_cents) === revenue) { unchanged++; continue; }
        if (old) throw Error('a different figure is already recorded for this month');
        await db.query('insert into sales(customer_id,product_id,month,qty,revenue_cents,source) values($1,$2,$3,$4,$5,$6)', [c.id, p.id, `${m}-01`, qty, revenue, path.basename(o.file)]);
        added++;
      } catch (e) { throw Error(`Row ${i + 2}: ${e.message}`); }
    }
    await audit(db, 'import sales', null, actor, { file: path.basename(o.file), rows: rows.length, added, unchanged });
    if (o['dry-run']) { await db.exec('ROLLBACK'); await db.exec('BEGIN'); }
    return { rows: rows.length, added, unchanged, dry_run: !!o['dry-run'] };
  });
}

export function human(value) {
  if (Array.isArray(value)) {
    if (!value.length) return '(none)';
    const keys = [...new Set(value.flatMap(Object.keys))];
    return table(value, keys.map((key) => ({
      key, label: key.replace(/_cents$/, '').replace(/_bps$/, ' %').replace(/_/g, ' '),
      align: /(_cents|_bps|qty|lines)$/.test(key) ? 'right' : undefined,
      format: (v) => v == null ? '' : key.endsWith('_cents') ? (Number(v) / 100).toFixed(2) : key.endsWith('_bps') ? (Number(v) / 100).toFixed(1) : typeof v === 'object' ? JSON.stringify(v) : String(v),
    })));
  }
  if (value && typeof value === 'object') {
    if (Object.values(value).every((v) => v === null || typeof v !== 'object')) return human([value]);
    return Object.entries(value).map(([k, v]) => `${k.replace(/_/g, ' ')}\n${v && typeof v === 'object' ? human(Array.isArray(v) ? v : [v]) : String(v)}`).join('\n\n');
  }
  return String(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let db;
  try {
    db = await getDb();
    const result = await run(db, process.argv.slice(2));
    console.log(process.argv.includes('--json') ? JSON.stringify(result, null, 2) : human(result));
  } catch (e) {
    if (process.argv.includes('--json')) console.error(JSON.stringify({ error: e.message, candidates: e.candidates || [] }));
    else { console.error(e.message); if (e.candidates?.length) console.error(human(e.candidates)); }
    process.exitCode = 1;
  } finally { if (db) await db.close(); }
}
