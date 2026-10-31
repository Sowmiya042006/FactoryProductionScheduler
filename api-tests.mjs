/**
 * api-tests.mjs
 * Focused verification suite hitting the live Express server on port 3001.
 * Run AFTER starting the server: node server/index.js
 *
 * Covers:
 *  1.  Health endpoint
 *  2.  Seed data loaded (lines, products, changeovers, orders, settings)
 *  3.  Order creation with validation
 *  4.  Order update
 *  5.  Order deletion
 *  6.  Seed data does NOT re-appear after deletion
 *  7.  Schedule generation: eligible-line assignment, no overlaps
 *  8.  Correct 60-min allergen cleaning (LATEX → NON_LATEX)
 *  9.  O01 impossible deadline
 * 10.  Best schedule score ≤ baseline score
 * 11.  GET /api/schedules/latest returns persisted run
 * 12.  Demo reset restores all 12 orders
 * 13.  Duplicate order ID rejected
 * 14.  Invalid product rejected
 * 15.  Zero/negative quantity rejected
 * 16.  Missing due date rejected
 */

const BASE = 'http://localhost:3001';
let pass = 0; let fail = 0;

function assert(label, cond, detail = '') {
  if (cond) {
    console.log(`  ✅ ${label}`);
    pass++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  const j = await r.json();
  return { status: r.status, body: j };
}
async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  return { status: r.status, body: j };
}
async function put(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  return { status: r.status, body: j };
}
async function del(path) {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  const j = await r.json();
  return { status: r.status, body: j };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n=== FlowPlan API Verification ===\n');

// 1. Health
console.log('1. Health endpoint:');
{
  const { status, body } = await get('/api/health');
  assert('GET /api/health returns 200', status === 200);
  assert('Response has ok:true', body.ok === true);
}

// 2. Seed data
console.log('\n2. Seed data:');
{
  const { body: lines }    = await get('/api/lines');
  const { body: products } = await get('/api/products');
  const { body: cos }      = await get('/api/changeovers');
  const { body: orders }   = await get('/api/orders');
  const { body: settings } = await get('/api/settings');

  assert('3 lines seeded', lines.data?.length === 3);
  assert('7 products seeded', products.data?.length === 7);
  assert('9 changeover entries', cos.data?.length === 9);
  assert('12 orders seeded', orders.data?.length === 12);
  assert('schedule_start setting present', !!settings.data?.schedule_start);
  assert('schedule_start value correct', settings.data?.schedule_start === '2026-11-02T08:00:00');

  // Check LATEX→NON_LATEX = 60
  const allergen = cos.data?.find(c => c.from_family === 'LATEX' && c.to_family === 'NON_LATEX');
  assert('LATEX→NON_LATEX changeover = 60', allergen?.minutes === 60);

  // Check P3 eligible for L1 only
  const p3 = products.data?.find(p => p.id === 'P3');
  assert('P3 eligible for L1 only', p3?.eligibleLines?.length === 1 && p3.eligibleLines[0] === 'L1');
}

// 3. Order validation — invalid cases
console.log('\n3. Order validation:');
{
  const { status: s1, body: b1 } = await post('/api/orders', { id: '', productId: 'P1', quantity: 10, dueISO: '2026-11-02T09:00:00' });
  assert('Empty ID rejected (422)', s1 === 422, `got ${s1}`);

  const { status: s2, body: b2 } = await post('/api/orders', { id: 'O01', productId: 'P1', quantity: 10, dueISO: '2026-11-02T09:00:00' });
  assert('Duplicate ID rejected (422)', s2 === 422, `got ${s2}: ${b2.error}`);

  const { status: s3 } = await post('/api/orders', { id: 'XTEST', productId: 'P_INVALID', quantity: 10, dueISO: '2026-11-02T09:00:00' });
  assert('Invalid product rejected (422)', s3 === 422);

  const { status: s4 } = await post('/api/orders', { id: 'XTEST', productId: 'P1', quantity: 0, dueISO: '2026-11-02T09:00:00' });
  assert('Zero quantity rejected (422)', s4 === 422);

  const { status: s5 } = await post('/api/orders', { id: 'XTEST', productId: 'P1', quantity: -5, dueISO: '2026-11-02T09:00:00' });
  assert('Negative quantity rejected (422)', s5 === 422);

  const { status: s6 } = await post('/api/orders', { id: 'XTEST', productId: 'P1', quantity: 5, dueISO: '' });
  assert('Missing due date rejected (422)', s6 === 422);
}

// 4. Order CRUD
console.log('\n4. Order CRUD:');
{
  // Create
  const { status: cs, body: cb } = await post('/api/orders', { id: 'T01', productId: 'P5', quantity: 5, dueISO: '2026-11-02T15:00:00' });
  assert('Create order returns 201', cs === 201);
  assert('Created order has correct ID', cb.data?.id === 'T01');

  // Read back
  const { body: ordersAfterCreate } = await get('/api/orders');
  assert('Orders list includes new order', ordersAfterCreate.data?.some(o => o.id === 'T01'));

  // Update
  const { status: us, body: ub } = await put('/api/orders/T01', { productId: 'P5', quantity: 10, dueISO: '2026-11-02T16:00:00' });
  assert('Update returns 200', us === 200);
  assert('Updated quantity correct', ub.data?.quantity === 10);

  // Delete
  const { status: ds } = await del('/api/orders/T01');
  assert('Delete returns 200', ds === 200);

  const { body: ordersAfterDelete } = await get('/api/orders');
  assert('Deleted order gone from list', !ordersAfterDelete.data?.some(o => o.id === 'T01'));
}

// 5. Schedule generation
console.log('\n5. Schedule generation:');
const schedResult = await post('/api/schedules', {});
assert('POST /api/schedules returns 201', schedResult.status === 201);

const { baseline, best, baselineMetrics, bestMetrics } = schedResult.body.data ?? {};

assert('Baseline has 12 rows',  baseline?.length === 12);
assert('Best has 12 rows',      best?.length === 12);

// Eligible-line assignment
console.log('\n6. Eligible-line assignment:');
{
  const products = (await get('/api/products')).body.data;
  for (const row of baseline) {
    const p = products.find(p => p.id === row.productId);
    assert(`${row.id} (${row.productId}) on eligible line ${row.lineId}`, p?.eligibleLines?.includes(row.lineId));
  }
}

// No overlapping jobs on any line
console.log('\n7. No line conflicts (baseline):');
{
  const lines = ['L1','L2','L3'];
  for (const lid of lines) {
    const rows = baseline.filter(r => r.lineId === lid).sort((a,b) => a.prodStart - b.prodStart);
    let ok = true;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].prodStart < rows[i-1].finish) { ok = false; break; }
    }
    assert(`${lid} no overlapping jobs (${rows.length} jobs)`, ok);
  }
}

// 8. O01 impossible deadline
console.log('\n8. O01 impossible deadline:');
{
  const o01 = baseline?.find(r => r.order_id === 'O01') ?? baseline?.find(r => r.id === 'O01');
  assert('O01 found in baseline', !!o01);
  assert('O01 duration = 60 min', o01?.duration === 60);
  assert('O01 is late', o01?.isLate === true);
  assert('O01 impossibleDeadline flag set', o01?.impossibleDeadline === true);

  const warnings = schedResult.body.data?.warnings ?? [];
  assert('Impossible deadline warning for O01', warnings.some(w => w.orderId === 'O01'), `warnings: ${JSON.stringify(warnings)}`);
}

// 9. Allergen clean check
console.log('\n9. Allergen clean (LATEX → NON_LATEX = 60 min):');
{
  // Find a row in baseline that is NON_LATEX and has cleaning > 0 on L1 (after LATEX O01)
  const o04 = baseline?.find(r => (r.order_id ?? r.id) === 'O04');
  assert('O04 (NON_LATEX on L1 after LATEX O01) has cleaning', o04?.cleaning > 0, `cleaning=${o04?.cleaning}`);
  assert('O04 cleaning = 60 min (allergen clean)', o04?.cleaning === 60, `got ${o04?.cleaning}`);
}

// 10. Best ≤ baseline
console.log('\n10. Best candidate no worse than baseline:');
{
  assert('Best totalLate ≤ Baseline totalLate', bestMetrics?.totalLate <= baselineMetrics?.totalLate,
    `best=${bestMetrics?.totalLate} baseline=${baselineMetrics?.totalLate}`);
  assert('Metrics objects present', !!baselineMetrics && !!bestMetrics);
}

// 11. GET /api/schedules/latest persists the run
console.log('\n11. Schedule persistence:');
{
  const { status, body } = await get('/api/schedules/latest');
  assert('GET /api/schedules/latest returns 200', status === 200);
  assert('Latest run has runId', !!body.data?.runId);
  assert('Latest baseline has 12 rows', body.data?.baseline?.length === 12);
  assert('Latest best has 12 rows', body.data?.best?.length === 12);
  assert('Snapshot stored', Array.isArray(body.data?.ordersSnapshot));
}

// 12. Demo reset
console.log('\n12. Demo reset:');
{
  // Delete a few orders first
  await del('/api/orders/O01');
  await del('/api/orders/O02');
  const { body: before } = await get('/api/orders');
  assert('Orders reduced before reset', before.data?.length === 10);

  await post('/api/demo/reset', {});
  const { body: after } = await get('/api/orders');
  assert('Orders restored to 12 after reset', after.data?.length === 12);
  assert('O01 back after reset', after.data?.some(o => o.id === 'O01'));
}

// 13. Seed does NOT duplicate on restart (idempotency)
console.log('\n13. Seed idempotency (no duplicate on repeated runs):');
{
  // We can't restart mid-test, but we verify count stays at 12
  const { body } = await get('/api/orders');
  assert('Order count still 12 (no duplication)', body.data?.length === 12);
}

// 14. Delete unknown order → 404
console.log('\n14. 404 on unknown order:');
{
  const { status } = await del('/api/orders/DOES_NOT_EXIST');
  assert('DELETE unknown order returns 404', status === 404);
}

// 15. Settings update
console.log('\n15. Settings update:');
{
  const { status, body } = await put('/api/settings', { schedule_start: '2026-11-03T07:00:00' });
  assert('PUT /api/settings returns 200', status === 200);
  assert('schedule_start updated', body.data?.schedule_start === '2026-11-03T07:00:00');

  // Restore
  await put('/api/settings', { schedule_start: '2026-11-02T08:00:00' });
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
if (fail > 0) process.exit(1);
