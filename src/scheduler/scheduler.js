/**
 * scheduler.js
 * Pure-function scheduling engine. All times are minutes relative to
 * SCHEDULE_START (minute 0 = 2026-11-02 08:00 local factory time).
 *
 * Algorithm summary
 * -----------------
 * buildSchedule(orders, ordering):
 *   For each order (in supplied ordering):
 *     1. Evaluate only eligible lines.
 *     2. Read line's availability and previous family.
 *     3. Cleaning = changeover matrix[prevFamily][thisFamily], or 0 if line is clean.
 *     4. setupStart   = lineAvailability
 *        prodStart    = setupStart + cleaning
 *        finish       = prodStart  + duration
 *        lateness     = max(0, finish - due)
 *     5. Choose earliest-finishing line.
 *     6. Ties: least cleaning → earliest line-ID lexicographic.
 *     7. Update line availability and prev family.
 *
 * compareCandidates():
 *   Baseline:  sort by due date.
 *   Candidates: all 6 permutations of families; within each family sort by due.
 *   Select best by: (1) lowest total late mins, (2) lowest cleaning mins, (3) earliest finish.
 *   Baseline is included so the result is never worse than EDD.
 */

import {
  LINES,
  PRODUCTS,
  CHANGEOVER_MATRIX,
  SCHEDULE_START,
} from '../data/defaults.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert Date → minutes since SCHEDULE_START */
export function toMins(date) {
  return (date.getTime() - SCHEDULE_START.getTime()) / 60000;
}

/** Convert minutes since SCHEDULE_START → Date */
export function fromMins(mins) {
  return new Date(SCHEDULE_START.getTime() + mins * 60000);
}

/** Format a Date as HH:MM (or "DD MMM HH:MM" if past midnight relative to start) */
export function fmtTime(date) {
  if (!date || isNaN(date.getTime())) return '—';
  const startDay = SCHEDULE_START.toDateString();
  if (date.toDateString() !== startDay) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
           ' ' + date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** All permutations of an array */
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = permutations([...arr.slice(0, i), ...arr.slice(i + 1)]);
    rest.forEach(p => result.push([arr[i], ...p]));
  }
  return result;
}

// ─── Core scheduler ──────────────────────────────────────────────────────────

/**
 * Build a concrete schedule given an ordered list of orders.
 * @param {object[]} orders  - enriched order objects (with .product, .dueMins etc.)
 * @returns {object[]} scheduled rows
 */
export function buildSchedule(orders) {
  // Line state: { avail: number (mins), prevFamily: string|null }
  const lineState = Object.fromEntries(
    LINES.map(l => [l.id, { avail: 0, prevFamily: null }])
  );

  const results = [];

  for (const order of orders) {
    const { product, dueMins, duration } = order;

    let best = null;

    for (const lineId of product.eligibleLines) {
      const state = lineState[lineId];
      const cleaning =
        state.prevFamily === null
          ? 0
          : CHANGEOVER_MATRIX[state.prevFamily][product.family];

      const setupStart  = state.avail;
      const prodStart   = setupStart + cleaning;
      const finish      = prodStart + duration;
      const lateness    = Math.max(0, finish - dueMins);

      const candidate = { lineId, cleaning, setupStart, prodStart, finish, lateness };

      if (
        best === null ||
        finish < best.finish ||
        (finish === best.finish && cleaning < best.cleaning) ||
        (finish === best.finish && cleaning === best.cleaning && lineId < best.lineId)
      ) {
        best = candidate;
      }
    }

    // Commit
    lineState[best.lineId].avail = best.finish;
    lineState[best.lineId].prevFamily = product.family;

    const impossibleDeadline =
      duration > dueMins; // production alone can't meet due date from t=0

    results.push({
      ...order,
      lineId:      best.lineId,
      lineName:    LINES.find(l => l.id === best.lineId).name,
      cleaning:    best.cleaning,
      setupStart:  best.setupStart,
      prodStart:   best.prodStart,
      finish:      best.finish,
      lateness:    best.lateness,
      isLate:      best.lateness > 0,
      impossibleDeadline,
    });
  }

  return results;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export function calcMetrics(scheduled) {
  const totalLate       = scheduled.reduce((s, r) => s + r.lateness, 0);
  const totalCleaning   = scheduled.reduce((s, r) => s + r.cleaning, 0);
  const lateCount       = scheduled.filter(r => r.isLate).length;
  const overallFinish   = scheduled.reduce((m, r) => Math.max(m, r.finish), 0);
  return { totalLate, totalCleaning, lateCount, overallFinish };
}

// ─── Enrichment ──────────────────────────────────────────────────────────────

/** Attach computed fields to raw orders before scheduling. */
export function enrichOrders(rawOrders) {
  return rawOrders.map(o => {
    const product  = PRODUCTS.find(p => p.id === o.productId);
    const dueDate  = new Date(o.dueISO);
    const dueMins  = toMins(dueDate);
    const duration = o.quantity * (product?.minsPerUnit ?? 0);
    return { ...o, product, dueDate, dueMins, duration };
  });
}

// ─── Ordering strategies ─────────────────────────────────────────────────────

/** Sort orders by due date (EDD baseline). */
function byDue(orders) {
  return [...orders].sort((a, b) => a.dueMins - b.dueMins);
}

/**
 * Sort by family sequence (permutation), then by due date within each family.
 */
function byFamilyPerm(orders, familyPerm) {
  return [...orders].sort((a, b) => {
    const fa = familyPerm.indexOf(a.product.family);
    const fb = familyPerm.indexOf(b.product.family);
    if (fa !== fb) return fa - fb;
    return a.dueMins - b.dueMins;
  });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Generate baseline + best candidate schedules.
 * Returns { baseline, best, allCandidates }
 */
export function generateSchedules(rawOrders) {
  if (!rawOrders || rawOrders.length === 0) {
    return { baseline: [], best: [], allCandidates: [], baselineMetrics: {}, bestMetrics: {} };
  }

  const orders = enrichOrders(rawOrders);

  // Baseline: EDD
  const baselineOrdering = byDue(orders);
  const baseline = buildSchedule(baselineOrdering);
  const baselineMetrics = calcMetrics(baseline);

  // Candidates: 6 permutations of family order, within each family sort by due
  const familyPerms = permutations(['LATEX', 'NON_LATEX', 'STANDARD']);
  const candidates = familyPerms.map(perm => {
    const ordered = byFamilyPerm(orders, perm);
    const sched   = buildSchedule(ordered);
    const metrics = calcMetrics(sched);
    return { perm, sched, metrics };
  });

  // Include baseline as a candidate so result is never worse
  candidates.push({ perm: ['EDD'], sched: baseline, metrics: baselineMetrics });

  // Pick best: (1) least late mins, (2) least cleaning, (3) earliest finish
  candidates.sort((a, b) => {
    if (a.metrics.totalLate     !== b.metrics.totalLate)     return a.metrics.totalLate     - b.metrics.totalLate;
    if (a.metrics.totalCleaning !== b.metrics.totalCleaning) return a.metrics.totalCleaning - b.metrics.totalCleaning;
    return a.metrics.overallFinish - b.metrics.overallFinish;
  });

  const bestCandidate  = candidates[0];
  const best           = bestCandidate.sched;
  const bestMetrics    = bestCandidate.metrics;

  return { baseline, best, allCandidates: candidates, baselineMetrics, bestMetrics };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateOrder(order, existingOrders) {
  const errors = [];
  if (!order.id || !order.id.trim()) errors.push('Order ID is required.');
  if (
    existingOrders.some(o => o.id === order.id.trim() && o._editKey !== order._editKey)
  ) errors.push('Order ID must be unique.');
  if (!PRODUCTS.find(p => p.id === order.productId)) errors.push('Select a valid product.');
  const qty = parseInt(order.quantity, 10);
  if (!Number.isInteger(qty) || qty <= 0) errors.push('Quantity must be a positive integer.');
  if (!order.dueISO || isNaN(new Date(order.dueISO).getTime())) errors.push('Due date/time is required.');
  return errors;
}

// ─── Impossible deadline warnings ────────────────────────────────────────────

/**
 * Returns a list of { order, message } for orders where production alone
 * can't meet the due date starting from t=0.
 */
export function getImpossibleWarnings(rawOrders) {
  return enrichOrders(rawOrders)
    .filter(o => o.duration > o.dueMins)
    .map(o => {
      const avail = Math.round(o.dueMins);
      return {
        orderId: o.id,
        message: `${o.id} cannot meet its deadline: it needs ${o.duration} min but only ${avail} min are available from schedule start.`,
      };
    });
}
