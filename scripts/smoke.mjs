// npm test: a temporary database, migrate twice, seed twice, then every CLI command with assertions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, reads, usage, cents, bps } from './price.mjs';
import { parseCsv } from './lib/csv.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-smoke-'));
process.env.DATA_DIR = path.join(temp, 'db');
process.env.OUTPUT_DIR = temp;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const db = await getDb();
const covered = new Set();
let checks = 0;
const check = (v, message) => { assert.ok(v, message); checks++; };
async function call(...args) { covered.add(args[0]); return run(db, args); }
async function fails(args, pattern) { covered.add(args[0]); await assert.rejects(() => run(db, args), pattern); checks++; }
const d = (await db.query("select (current_date+10)::text as soon,(current_date+60)::text as later,(current_date-1)::text as yesterday,current_date::text as today,to_char(current_date-interval '1 month','YYYY-MM') as last_month"))[0];

try {
  await migrate(db);
  check((await migrate(db)).ran.length === 0, 'migration repeat is a no-op');
  if (db.mode === 'postgres') await db.exec('truncate audit,notices,discount_requests,list_prices,special_prices,sales,price_changes,customers,price_lists,costs,products,margin_rules cascade');
  await seed(db); await seed(db);
  check((await db.query('select count(*)::int n from products'))[0].n === 8, 'seed is idempotent');

  for (const cmd of Object.keys(reads)) check(Array.isArray(await call(cmd)), cmd + ' returns rows');
  check((await call('help')).length === Object.keys(usage).length, 'help lists every command');

  // The seeded problems show up where an owner would look.
  const moves = await call('cost-moves');
  check(moves.length === 2 && moves.every((r) => r.state === 'price not reviewed since cost moved'), 'cost rise not passed through');
  const below = await call('below-floor');
  check(below.some((r) => r.kind === 'special' && r.who === 'Waikato Fleet Services'), 'special below floor');
  check(below.some((r) => r.kind === 'list' && r.who === 'TRADE' && r.sku === 'OIL-1540-5L' && r.margin_bps === 2064), 'exact list margin in basis points');
  check((await call('specials-expiring')).length === 2, 'two specials expiring');
  const leak = await call('leakage');
  check(Number(leak.find((r) => r.sku === 'COOL-LL-20L').leakage_cents) === 45000, 'expired special still honoured shows as leakage');
  check(Number(leak.find((r) => r.sku === 'OIL-1540-5L').leakage_cents) === 33000, 'rep discount leakage exact');
  check((await call('leakage-by-rep')).find((r) => r.rep === 'Aroha').leakage_cents == 63000, 'leakage by rep');
  const rules = (await call('compliance')).map((r) => r.rule);
  for (const r of ['PM01', 'PM02', 'PM03', 'PM04', 'PM05', 'PM06']) check(rules.includes(r), 'compliance finds ' + r);
  check((await call('notices-due')).some((r) => r.account === 'WAIFLEET' && r.notice_state.startsWith('late')), 'late notice found');
  check((await call('attention')).length >= 10, 'attention lists the seeded problems');

  // Details and the price a customer pays.
  check((await call('list', 'trade')).prices.length === 10, 'list detail');
  check((await call('customer', 'waifleet')).prices.find((r) => r.sku === 'OIL-1540-20L').basis === 'special', 'special overrides list');
  check((await call('customer', 'canterbury')).sales_3m.length === 3, 'customer sales');
  check((await call('product', 'OIL-1540-5L')).costs.length === 3, 'product cost history across currencies');
  const q12 = await call('price', 'CANTAG', 'OIL-1540-20L', '--qty=12');
  check(q12.unit_cents === 12400 && q12.total_cents === 148800 && q12.below_floor === true, 'quantity break applies and floor is flagged');
  check((await call('price', 'CANTAG', 'OIL-1540-20L')).unit_cents === 12900, 'single unit price');
  check((await call('price', 'WAIFLEET', 'OIL-1540-20L', '--qty=12')).basis.startsWith('special'), 'special beats a dearer break');
  const ch = await call('change', 'oils increase');
  check(ch.lines.length === 7 && ch.impact[0].revenue_12m_cents > 0, 'change impact');
  check((await call('weekly-review')).compliance.length > 5, 'weekly review');
  await fails(['customer', 'o'], /Ambiguous customer/);
  await fails(['product', 'nothing-like-this'], /No matching product/);
  await fails(['list', 'NOPE'], /No price list/);
  await fails(['price', 'BRISMECH', 'GLV-NIT-100'], /no price on AU-TRADE/);

  // Products, costs and list prices.
  const prod = await call('add-product', '--sku=TEST-1', '--name=Test <script>', '--group=Workshop', '--actor=Tester');
  await fails(['add-product', '--sku=TEST-1', '--name=Dup', '--actor=T'], /unique|duplicate/);
  await fails(['add-product', '--sku=TEST-2', '--name=X'], /--actor is required/);
  await call('cost', 'TEST-1', '--cost=10.00', '--currency=NZD', `--from=${d.yesterday}`, '--source=Supplier quote', '--actor=Tester');
  await fails(['cost', 'TEST-1', '--cost=10.001', '--currency=NZD', `--from=${d.today}`, '--source=X', '--actor=T'], /two decimals/);
  await fails(['cost', 'TEST-1', '--cost=10', '--currency=nzd', `--from=${d.today}`, '--source=X', '--actor=T'], /Currency/);
  const set = await call('set-price', 'TRADE', 'TEST-1', '--price=12.00', `--from=${d.yesterday}`, '--actor=Tester');
  check(set.margin.below_floor === true && set.margin.margin_bps === 1666, 'set price reports margin');
  await call('set-price', 'TRADE', 'TEST-1', '--price=16.00', `--from=${d.today}`, '--actor=Tester');
  check((await call('price', 'CANTAG', 'TEST-1')).unit_cents === 1600, 'new price replaces old from its date');
  await call('set-price', 'TRADE', 'TEST-1', '--price=15.00', `--from=${d.soon}`, '--min-qty=20', '--draft', '--actor=Tester');
  check((await call('list', 'TRADE')).prices.some((r) => r.sku === 'TEST-1' && r.status === 'draft'), 'draft price held back');
  await fails(['set-price', 'TRADE', 'TEST-1', '--price=1', `--from=${d.today}`, `--to=${d.yesterday}`, '--actor=T'], /before --from/);
  check((await call('approve-list', 'TRADE', `--from=${d.soon}`, '--actor=Pricing manager')).approved === 1, 'approve drafts');
  await fails(['approve-list', 'TRADE', `--from=${d.soon}`, '--actor=T'], /No draft prices/);

  // Customers and specials.
  const cust = await call('add-customer', '--account=TESTCO', '--name=Test Customer', '--list=WORKSHOP', '--rep=Tester', '--email=test@example.com', '--notice-days=10', '--actor=Tester');
  await fails(['add-customer', '--account=BAD', '--name=Bad', '--list=WORKSHOP', '--email=not-an-email', '--actor=T'], /Invalid email/);
  await call('assign-list', 'TESTCO', '--list=TRADE', '--actor=Tester');
  check((await call('customer', 'TESTCO')).customer.list === 'TRADE', 'list reassigned');
  const sp = await call('special', 'TESTCO', 'TEST-1', '--price=11.00', `--from=${d.today}`, `--to=${d.later}`, '--reason=Trial', '--actor=Rep');
  check(sp.status === 'pending' && sp.margin.below_floor, 'special starts pending');
  check((await call('price', 'TESTCO', 'TEST-1')).unit_cents === 1600, 'pending special does not count');
  await fails(['approve-special', sp.id, '--actor=Manager'], /Below the margin floor/);
  await call('approve-special', sp.id, '--below-floor-ok=Trial account for one quarter', '--actor=Manager');
  check((await call('price', 'TESTCO', 'TEST-1')).unit_cents === 1100, 'approved special counts');
  await fails(['approve-special', sp.id, '--actor=Manager'], /already approved/);
  await call('retire-special', sp.id, '--reason=Trial ended', '--actor=Manager');
  await fails(['retire-special', sp.id, '--reason=again', '--actor=Manager'], /No matching special/);
  check((await call('price', 'TESTCO', 'TEST-1')).unit_cents === 1600, 'retired special stops counting');
  await fails(['special', 'TESTCO', 'TEST-1', '--price=11', `--from=${d.later}`, `--to=${d.today}`, '--reason=x', '--actor=T'], /before --from/);

  // Discount requests need a second person.
  const req = await call('request-discount', 'TESTCO', 'TEST-1', '--price=13.00', '--qty=50', '--reason=Tender', '--actor=Rep');
  await fails(['decide', req.id, '--decision=approved', '--note=ok', '--actor=Rep'], /cannot decide their own/);
  await fails(['decide', req.id, '--decision=maybe', '--note=ok', '--actor=Manager'], /approved or/);
  check((await call('decide', req.id, '--decision=declined', '--note=Below floor, offer the 20+ break', '--actor=Manager')).status === 'declined', 'decided');
  await fails(['decide', req.id, '--decision=approved', '--note=x', '--actor=Manager'], /already declined/);

  // A price change from draft to live, gated on notice.
  const change = await call('change-new', '--name=Test rise', `--effective=${d.later}`, '--uplift=5', '--lists=TRADE', '--groups=Workshop', '--actor=Tester');
  await fails(['change-new', '--name=Bad', `--effective=${d.today}`, '--uplift=5', '--lists=TRADE', '--actor=T'], /after today/);
  await fails(['change-new', '--name=Bad', `--effective=${d.later}`, '--uplift=5', '--lists=NOPE', '--actor=T'], /No price list/);
  await fails(['change-new', '--name=Bad', `--effective=${d.later}`, '--uplift=80', '--lists=TRADE', '--actor=T'], /between -50 and 50/);
  await fails(['draft-notice', 'Test rise', 'TESTCO', '--actor=Tester'], /approve it first/);
  await fails(['change-approve', 'Test rise', '--actor=Tester'], /drafted the change cannot approve/);
  await call('change-approve', 'Test rise', '--actor=Manager');
  await fails(['change-apply', 'Test rise', '--actor=Manager'], /not notified in time/);
  const draft = await call('draft-notice', 'Test rise', 'TESTCO', '--actor=Tester');
  const letter = fs.readFileSync(draft.file, 'utf8');
  check(letter.includes('TEST-1') && letter.includes('NZD 16.00') && letter.includes('NZD 16.80'), 'notice letter has old and new prices');
  check(draft.file !== (await call('draft-notice', 'Test rise', 'TESTCO', '--actor=Tester')).file, 'drafts never overwrite');
  await fails(['notice', 'Test rise', 'TESTCO', '--on=2099-01-01', '--evidence=x', '--actor=T'], /after it is sent/);
  for (const acct of ['TESTCO', 'WAIFLEET', 'CANTAG']) await call('notice', 'Test rise', acct, `--on=${d.today}`, '--evidence=Letter emailed', '--actor=Tester');
  await fails(['notice', 'Test rise', 'TESTCO', `--on=${d.today}`, '--evidence=again', '--actor=T'], /unique|duplicate/);
  await fails(['notice', 'Test rise', 'BRISMECH', `--on=${d.today}`, '--evidence=x', '--actor=T'], /not on a list/);
  const applied = await call('change-apply', 'Test rise', '--actor=Manager');
  check(applied.prices_written === 4, 'change writes new prices');
  check((await call('list', 'TRADE')).prices.some((r) => r.sku === 'TEST-1' && r.price_cents == 1680 && r.valid_from === d.later), 'future price written from effective date');
  check((await call('price', 'CANTAG', 'TEST-1')).unit_cents === 1600, 'today still on current price');
  await fails(['change-apply', 'Test rise', '--actor=Manager'], /change is live/);
  await fails(['change-cancel', 'Test rise', '--reason=x', '--actor=Manager'], /Change is live/);
  await fails(['draft-notice', 'oils increase', 'WAIFLEET', '--actor=T'], /approve it first/);
  await call('change-approve', 'oils increase', '--actor=Manager');
  await fails(['draft-notice', 'oils increase', 'WAIFLEET', '--actor=T'], /needs 60 days notice/);
  await fails(['draft-notice', 'oils increase', 'HBORCH', '--actor=T'], /no email/);
  check((await call('change-cancel', 'oils increase', '--reason=Supplier withdrew surcharge', '--actor=Manager')).status === 'cancelled', 'cancel');
  check(change.status === 'draft', 'new change starts as draft');

  // Imports: a Pricefx price list export lands as drafts; sales from an ERP report.
  const imp = ['import', 'pricefx', 'DIST', '--file=examples/pricefx-price-list.csv', `--from=${d.later}`, '--actor=Migration'];
  const before = (await db.query('select count(*)::int n from list_prices'))[0].n;
  check((await call(...imp, '--dry-run')).added === 5, 'dry run counts');
  check((await db.query('select count(*)::int n from list_prices'))[0].n === before, 'dry run writes nothing');
  const first = await call(...imp);
  check(first.added === 5 && first.new_products === 1, 'pricefx import');
  check((await call(...imp)).unchanged === 5, 'repeat import is idempotent');
  const mapFile = path.join(temp, 'map.json'), csvFile = path.join(temp, 'mapped.csv');
  fs.writeFileSync(mapFile, JSON.stringify({ sku: 'Item', price: 'Net', qty: 'Break' }));
  fs.writeFileSync(csvFile, 'Item,Net,Break\nGLV-NIT-100,14.10,1\n');
  check((await call('import', 'pricefx', 'DIST', `--file=${csvFile}`, `--map=${mapFile}`, `--from=${d.later}`, '--actor=Migration')).added === 1, 'mapped import');
  fs.writeFileSync(csvFile, 'Item,Net,Break\nGLV-NIT-100,14.20,1\nCLN-BRAKE-400,5.90,1\n');
  await fails(['import', 'pricefx', 'DIST', `--file=${csvFile}`, `--map=${mapFile}`, `--from=${d.later}`, '--actor=M'], /different price/);
  check((await db.query("select count(*)::int n from list_prices lp join products p on p.id=lp.product_id where p.sku='CLN-BRAKE-400' and lp.price_cents=590"))[0].n === 0, 'failed import rolls back');
  fs.writeFileSync(csvFile, 'sku,resultPrice\nX,abc\n');
  await fails(['import', 'pricefx', 'DIST', `--file=${csvFile}`, `--from=${d.later}`, '--actor=M'], /Row 2/);
  await fails(['approve-list', 'DIST', `--from=${d.later}`, '--actor=Pricing manager'], /Below the margin floor/);
  check((await call('approve-list', 'DIST', `--from=${d.later}`, '--below-floor-ok=Distributor volume agreement', '--actor=Pricing manager')).approved === 6, 'approve imported list');
  const sales = path.join(temp, 'sales.csv');
  fs.writeFileSync(sales, `account,sku,month,qty,revenue\nTESTCO,TEST-1,${d.last_month},10,160.00\nCANTAG,GLV-NIT-100,${d.last_month},5,82.50\n`);
  check((await call('import', 'sales', `--file=${sales}`, '--actor=Migration')).added === 2, 'sales import');
  check((await call('import', 'sales', `--file=${sales}`, '--actor=Migration')).unchanged === 2, 'sales import repeat');
  fs.writeFileSync(sales, `account,sku,month,qty,revenue\nNOBODY,TEST-1,${d.last_month},1,1.00\n`);
  await fails(['import', 'sales', `--file=${sales}`, '--actor=M'], /unknown customer/);
  await fails(['import', 'xero', `--file=${sales}`, '--actor=M'], /pricefx and sales/);

  // Drafts, export, guards.
  const rev = await call('draft-review', '--actor=Tester');
  check(fs.readFileSync(rev.file, 'utf8').includes('Weekly pricing review'), 'review draft');
  const ex = await call('export', `--file=${path.join(temp, 'backup.json')}`);
  check(JSON.parse(fs.readFileSync(ex.file, 'utf8')).products.length === 10, 'export holds every product');
  await fails(['export', `--file=${ex.file}`], /EEXIST/);
  await fails(['margins', '--json=yes'], /flag without a value/);
  await fails(['margins', '--oops'], /Unknown option/);
  await fails(['not-a-command'], /Unknown command/);
  await assert.rejects(() => db.query("update audit set actor='x'"), /append-only/); checks++;
  await assert.rejects(() => db.query('delete from costs'), /append-only/); checks++;
  await assert.rejects(() => db.query('delete from notices'), /append-only/); checks++;
  check((await call('history')).some((r) => r.action === 'change-apply'), 'audit trail');
  assert.throws(() => cents('0')); assert.throws(() => cents('1e3')); assert.equal(cents('0.01'), 1); assert.equal(bps('4.5'), 450); checks += 4;
  check(parseCsv('﻿sku,resultPrice\r\n"A,1","2.50"\r\n')[0].sku === 'A,1', 'quoted CSV');

  await db.close();
  for (const script of ['view', 'docs']) {
    const p = spawnSync(process.execPath, ['scripts/' + script + '.mjs'], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
    check(p.status === 0, script + ': ' + p.stderr);
  }
  const html = fs.readdirSync(path.join(temp, 'views')).map((f) => fs.readFileSync(path.join(temp, 'views', f), 'utf8')).join('');
  check(html.includes('Test &lt;script&gt;') && !html.includes('Test <script>'), 'HTML escapes record text');
  check(fs.readdirSync(path.join(temp, 'docs-out')).length >= 2, 'documents rendered');
  const cli = spawnSync(process.execPath, ['scripts/price.mjs', 'margins', '--json'], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
  check(cli.status === 0 && Array.isArray(JSON.parse(cli.stdout)), 'CLI JSON');
  const amb = spawnSync(process.execPath, ['scripts/price.mjs', 'customer', 'o', '--json'], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
  check(amb.status === 1 && JSON.parse(amb.stderr).candidates.length > 1, 'ambiguous name lists candidates and exits 1');
  for (const command of Object.keys(usage)) check(covered.has(command), 'not exercised: ' + command);
  console.log(`PASS: ${checks} checks; ${Object.keys(usage).length} CLI commands; ${process.env.TEST_DATABASE_URL ? 'PostgreSQL' : 'PGlite'}`);
} finally {
  try { await db.close(); } catch {}
  fs.rmSync(temp, { recursive: true, force: true });
}
