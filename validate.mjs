/**
 * Scheduling logic validation — runs in Node.js.
 * Tests: impossible-deadline detection, late order detection, cleaning logic,
 * baseline metrics, and best-candidate selection.
 */

// ─── Inline minimal dataset (mirrors src/data/defaults.js) ───────────────────
const SCHEDULE_START = new Date('2026-11-02T08:00:00');
const LINES = [
  { id: 'L1', name: 'Moulding' },
  { id: 'L2', name: 'Assembly' },
  { id: 'L3', name: 'Packing' },
];
const CHANGEOVER_MATRIX = {
  LATEX:     { LATEX: 0,  NON_LATEX: 60, STANDARD: 60 },
  NON_LATEX: { LATEX: 20, NON_LATEX: 0,  STANDARD: 15 },
  STANDARD:  { LATEX: 20, NON_LATEX: 15, STANDARD: 0  },
};
const PRODUCTS = [
  { id: 'P1', name: 'Latex seal',         family: 'LATEX',     eligibleLines: ['L1'],      minsPerUnit: 3 },
  { id: 'P2', name: 'Latex component',    family: 'LATEX',     eligibleLines: ['L1','L2'], minsPerUnit: 4 },
  { id: 'P3', name: 'Non-latex seal',     family: 'NON_LATEX', eligibleLines: ['L1'],      minsPerUnit: 3 },
  { id: 'P4', name: 'Non-latex kit',      family: 'NON_LATEX', eligibleLines: ['L2','L3'], minsPerUnit: 4 },
  { id: 'P5', name: 'Standard component', family: 'STANDARD',  eligibleLines: ['L1','L2'], minsPerUnit: 2 },
  { id: 'P6', name: 'Standard kit',       family: 'STANDARD',  eligibleLines: ['L2','L3'], minsPerUnit: 3 },
  { id: 'P7', name: 'Standard carton',    family: 'STANDARD',  eligibleLines: ['L3'],      minsPerUnit: 2 },
];
const DEFAULT_ORDERS = [
  { id: 'O01', productId: 'P1', quantity: 20,  dueISO: '2026-11-02T08:30:00' },
  { id: 'O02', productId: 'P4', quantity: 10,  dueISO: '2026-11-02T09:00:00' },
  { id: 'O03', productId: 'P7', quantity: 20,  dueISO: '2026-11-02T09:15:00' },
  { id: 'O04', productId: 'P3', quantity: 10,  dueISO: '2026-11-02T10:00:00' },
  { id: 'O05', productId: 'P2', quantity: 10,  dueISO: '2026-11-02T10:15:00' },
  { id: 'O06', productId: 'P5', quantity: 20,  dueISO: '2026-11-02T10:30:00' },
  { id: 'O07', productId: 'P6', quantity: 10,  dueISO: '2026-11-02T11:00:00' },
  { id: 'O08', productId: 'P1', quantity: 10,  dueISO: '2026-11-02T11:30:00' },
  { id: 'O09', productId: 'P4', quantity: 15,  dueISO: '2026-11-02T12:00:00' },
  { id: 'O10', productId: 'P7', quantity: 15,  dueISO: '2026-11-02T12:15:00' },
  { id: 'O11', productId: 'P3', quantity: 20,  dueISO: '2026-11-02T13:00:00' },
  { id: 'O12', productId: 'P2', quantity: 15,  dueISO: '2026-11-02T14:00:00' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toMins(date) {
  return (date.getTime() - SCHEDULE_START.getTime()) / 60000;
}
function fromMins(m) {
  return new Date(SCHEDULE_START.getTime() + m * 60000);
}
function fmt(m) {
  const d = fromMins(m);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const r = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = permutations([...arr.slice(0, i), ...arr.slice(i + 1)]);
    rest.forEach(p => r.push([arr[i], ...p]));
  }
  return r;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
function enrichOrders(rawOrders) {
  return rawOrders.map(o => {
    const product = PRODUCTS.find(p => p.id === o.productId);
    const dueDate = new Date(o.dueISO);
    const dueMins = toMins(dueDate);
    const duration = o.quantity * (product?.minsPerUnit ?? 0);
    return { ...o, product, dueDate, dueMins, duration };
  });
}

function buildSchedule(orders) {
  const lineState = Object.fromEntries(LINES.map(l => [l.id, { avail: 0, prevFamily: null }]));
  const results = [];
  for (const order of orders) {
    const { product, dueMins, duration } = order;
    let best = null;
    for (const lineId of product.eligibleLines) {
      const state = lineState[lineId];
      const cleaning = state.prevFamily === null ? 0 : CHANGEOVER_MATRIX[state.prevFamily][product.family];
      const setupStart = state.avail;
      const prodStart  = setupStart + cleaning;
      const finish     = prodStart + duration;
      const lateness   = Math.max(0, finish - dueMins);
      const candidate  = { lineId, cleaning, setupStart, prodStart, finish, lateness };
      if (best === null || finish < best.finish || (finish === best.finish && cleaning < best.cleaning) || (finish === best.finish && cleaning === best.cleaning && lineId < best.lineId)) {
        best = candidate;
      }
    }
    lineState[best.lineId].avail = best.finish;
    lineState[best.lineId].prevFamily = product.family;
    results.push({ ...order, lineId: best.lineId, lineName: LINES.find(l => l.id === best.lineId).name, cleaning: best.cleaning, prodStart: best.prodStart, finish: best.finish, lateness: best.lateness, isLate: best.lateness > 0, impossibleDeadline: duration > dueMins });
  }
  return results;
}

function calcMetrics(sched) {
  return {
    totalLate:     sched.reduce((s, r) => s + r.lateness, 0),
    totalCleaning: sched.reduce((s, r) => s + r.cleaning, 0),
    lateCount:     sched.filter(r => r.isLate).length,
    overallFinish: sched.reduce((m, r) => Math.max(m, r.finish), 0),
  };
}

function generateSchedules(rawOrders) {
  const orders = enrichOrders(rawOrders);
  const baseline = buildSchedule([...orders].sort((a, b) => a.dueMins - b.dueMins));
  const baselineMetrics = calcMetrics(baseline);
  const familyPerms = permutations(['LATEX', 'NON_LATEX', 'STANDARD']);
  const candidates = familyPerms.map(perm => {
    const ordered = [...orders].sort((a, b) => {
      const fa = perm.indexOf(a.product.family);
      const fb = perm.indexOf(b.product.family);
      if (fa !== fb) return fa - fb;
      return a.dueMins - b.dueMins;
    });
    const sched = buildSchedule(ordered);
    return { perm, sched, metrics: calcMetrics(sched) };
  });
  candidates.push({ perm: ['EDD'], sched: baseline, metrics: baselineMetrics });
  candidates.sort((a, b) => {
    if (a.metrics.totalLate !== b.metrics.totalLate)         return a.metrics.totalLate - b.metrics.totalLate;
    if (a.metrics.totalCleaning !== b.metrics.totalCleaning) return a.metrics.totalCleaning - b.metrics.totalCleaning;
    return a.metrics.overallFinish - b.metrics.overallFinish;
  });
  return { baseline, best: candidates[0].sched, baselineMetrics, bestMetrics: candidates[0].metrics };
}

// ─── Run validation ───────────────────────────────────────────────────────────
let pass = 0; let fail = 0;
function assert(label, cond) {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else      { console.error(`  ❌ FAIL: ${label}`); fail++; }
}

console.log('\n=== FlowPlan Scheduling Validation ===\n');

// 1. O01: Latex seal, 20 units × 3 min = 60 min, due at 30 min → impossible
const { baseline, best, baselineMetrics, bestMetrics } = generateSchedules(DEFAULT_ORDERS);

const o01 = baseline.find(r => r.id === 'O01');
console.log('1. O01 (Latex seal, 20u, due 08:30):');
assert('O01 has duration=60', o01.duration === 60);
assert('O01 due=30min', Math.round(o01.dueMins) === 30);
assert('O01 is late (60 > 30)', o01.isLate);
assert('O01 impossibleDeadline flag set', o01.impossibleDeadline);
assert('O01 scheduled on L1 (only eligible)', o01.lineId === 'L1');
console.log(`   Scheduled: line=${o01.lineId}, prodStart=${fmt(o01.prodStart)}, finish=${fmt(o01.finish)}, lateness=${o01.lateness} min`);

// 2. All 12 orders appear exactly once in baseline
console.log('\n2. Order completeness:');
assert('Baseline has exactly 12 rows', baseline.length === 12);
assert('Best has exactly 12 rows', best.length === 12);
const baselineIds = baseline.map(r => r.id).sort();
const allIds = DEFAULT_ORDERS.map(o => o.id).sort();
assert('All order IDs present in baseline', JSON.stringify(baselineIds) === JSON.stringify(allIds));

// 3. Line eligibility respected
console.log('\n3. Line eligibility:');
for (const row of baseline) {
  assert(`${row.id} on eligible line`, row.product.eligibleLines.includes(row.lineId));
}

// 4. No overlapping jobs on same line
console.log('\n4. No line conflicts:');
for (const line of LINES) {
  const rows = baseline.filter(r => r.lineId === line.id).sort((a, b) => a.prodStart - b.prodStart);
  let ok = true;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].prodStart < rows[i-1].finish) { ok = false; break; }
  }
  assert(`${line.id} no overlaps (${rows.length} jobs)`, ok);
}

// 5. Cleaning = 0 for same family consecutively
console.log('\n5. Same-family cleaning:');
// In the baseline, O02 (Non-latex kit) and O09 (Non-latex kit) are both NON_LATEX on L3.
// After O03 (STANDARD) on L3, O07 (STANDARD) follows → cleaning should be 0
const l3Rows = baseline.filter(r => r.lineId === 'L3').sort((a,b) => a.prodStart - b.prodStart);
console.log(`   L3 sequence: ${l3Rows.map(r => `${r.id}(${r.product.family},clean=${r.cleaning})`).join(' → ')}`);
assert('L3 starts with no cleaning (clean line)', l3Rows[0].cleaning === 0);
// O07 (STANDARD) follows O03 (STANDARD) on L3 → zero cleaning
const o07 = baseline.find(r => r.id === 'O07');
if (o07) assert('O07 on L3 (STANDARD after STANDARD) has cleaning=0', o07.cleaning === 0);

// 6. Changeover LATEX→NON_LATEX = 60
console.log('\n6. Allergen clean (LATEX→NON_LATEX = 60):');
assert('Matrix LATEX→NON_LATEX=60', CHANGEOVER_MATRIX.LATEX.NON_LATEX === 60);
assert('Matrix LATEX→STANDARD=60', CHANGEOVER_MATRIX.LATEX.STANDARD === 60);
assert('Matrix NON_LATEX→LATEX=20', CHANGEOVER_MATRIX.NON_LATEX.LATEX === 20);

// 7. Best candidate metrics
console.log('\n7. Candidate comparison:');
console.log(`   Baseline: lateOrders=${baselineMetrics.lateCount}, totalLate=${baselineMetrics.totalLate} min, cleaning=${baselineMetrics.totalCleaning} min, finish=${fmt(baselineMetrics.overallFinish)}`);
console.log(`   Best:     lateOrders=${bestMetrics.lateCount}, totalLate=${bestMetrics.totalLate} min, cleaning=${bestMetrics.totalCleaning} min, finish=${fmt(bestMetrics.overallFinish)}`);
assert('Best totalLate ≤ Baseline totalLate', bestMetrics.totalLate <= baselineMetrics.totalLate);
assert('Best cleaning ≤ Baseline cleaning OR bestLate < baselineLate', bestMetrics.totalLate < baselineMetrics.totalLate || bestMetrics.totalCleaning <= baselineMetrics.totalCleaning);

// 8. Empty list
console.log('\n8. Empty orders:');
const empty = generateSchedules([]);
assert('Empty schedule returns no rows', empty.baseline.length === 0 && empty.best.length === 0);

// ─── Print full baseline schedule ────────────────────────────────────────────
console.log('\n=== Baseline Schedule ===');
console.log('Order  Product              Line  Clean  ProdStart  Finish  Due    Late');
for (const r of baseline) {
  console.log(
    `${r.id.padEnd(6)} ${(r.product?.name ?? '').padEnd(20)} ${r.lineId}    ${String(r.cleaning).padStart(3)}    ${fmt(r.prodStart)}       ${fmt(r.finish)}   ${fmt(r.dueMins)}   ${r.lateness > 0 ? r.lateness+'m LATE' : 'OK'}`
  );
}

console.log('\n=== Best Schedule ===');
for (const r of best) {
  console.log(
    `${r.id.padEnd(6)} ${(r.product?.name ?? '').padEnd(20)} ${r.lineId}    ${String(r.cleaning).padStart(3)}    ${fmt(r.prodStart)}       ${fmt(r.finish)}   ${fmt(r.dueMins)}   ${r.lateness > 0 ? r.lateness+'m LATE' : 'OK'}`
  );
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
if (fail > 0) process.exit(1);
