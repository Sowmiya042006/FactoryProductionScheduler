/**
 * server/scheduler.js
 * Pure scheduling functions mirroring src/scheduler/scheduler.js exactly.
 * Runs in Node.js; does NOT import from the frontend source tree.
 *
 * Timezone convention: all due_iso / schedule_start strings are parsed with
 * `new Date(str)` which Node.js treats as LOCAL time when no offset suffix is
 * present — matching the browser's behaviour.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toMins(date, scheduleStart) {
  return (date.getTime() - scheduleStart.getTime()) / 60000;
}

export function fromMins(mins, scheduleStart) {
  return new Date(scheduleStart.getTime() + mins * 60000);
}

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
 * Build a concrete schedule from an ordered list of enriched orders.
 * @param {object[]} orders  - enriched (product, dueMins, duration attached)
 * @param {object[]} lines   - [{ id, name }]
 * @param {object}   matrix  - { FROM: { TO: minutes } }
 */
export function buildSchedule(orders, lines, matrix) {
  const lineState = Object.fromEntries(
    lines.map(l => [l.id, { avail: 0, prevFamily: null }])
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
          : (matrix[state.prevFamily]?.[product.family] ?? 0);

      const setupStart = state.avail;
      const prodStart  = setupStart + cleaning;
      const finish     = prodStart + duration;
      const lateness   = Math.max(0, finish - dueMins);

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

    lineState[best.lineId].avail      = best.finish;
    lineState[best.lineId].prevFamily = product.family;

    const impossibleDeadline = duration > dueMins;

    results.push({
      ...order,
      lineId:             best.lineId,
      lineName:           lines.find(l => l.id === best.lineId).name,
      cleaning:           best.cleaning,
      setupStart:         best.setupStart,
      prodStart:          best.prodStart,
      finish:             best.finish,
      lateness:           best.lateness,
      isLate:             best.lateness > 0,
      impossibleDeadline,
    });
  }

  return results;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export function calcMetrics(scheduled) {
  if (!scheduled || scheduled.length === 0) {
    return { totalLate: 0, totalCleaning: 0, lateCount: 0, overallFinish: 0 };
  }
  return {
    totalLate:     scheduled.reduce((s, r) => s + r.lateness, 0),
    totalCleaning: scheduled.reduce((s, r) => s + r.cleaning, 0),
    lateCount:     scheduled.filter(r => r.isLate).length,
    overallFinish: scheduled.reduce((m, r) => Math.max(m, r.finish), 0),
  };
}

// ─── Enrichment ──────────────────────────────────────────────────────────────

/**
 * Attach computed fields to raw DB rows.
 * @param {object[]} rawOrders  - rows from the orders table
 * @param {object[]} products   - full product objects with eligibleLines[]
 * @param {Date}     scheduleStart
 */
export function enrichOrders(rawOrders, products, scheduleStart) {
  return rawOrders.map(o => {
    const product  = products.find(p => p.id === o.product_id);
    const dueDate  = new Date(o.due_iso);
    const dueMins  = toMins(dueDate, scheduleStart);
    const duration = o.quantity * (product?.minsPerUnit ?? 0);
    return {
      id:        o.id,
      productId: o.product_id,
      quantity:  o.quantity,
      dueISO:    o.due_iso,
      product,
      dueDate,
      dueMins,
      duration,
    };
  });
}

// ─── Ordering strategies ─────────────────────────────────────────────────────

function byDue(orders) {
  return [...orders].sort((a, b) => a.dueMins - b.dueMins);
}

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
 * Generate baseline + best candidate schedules from raw DB data.
 * @param {object[]} rawOrders
 * @param {object[]} products  - with eligibleLines[]
 * @param {object[]} lines
 * @param {object}   matrix
 * @param {Date}     scheduleStart
 * @returns {{ baseline, best, baselineMetrics, bestMetrics, bestPerm }}
 */
export function generateSchedules(rawOrders, products, lines, matrix, scheduleStart) {
  if (!rawOrders || rawOrders.length === 0) {
    const empty = { totalLate: 0, totalCleaning: 0, lateCount: 0, overallFinish: 0 };
    return { baseline: [], best: [], baselineMetrics: empty, bestMetrics: empty, bestPerm: ['EDD'] };
  }

  const orders = enrichOrders(rawOrders, products, scheduleStart);

  // Baseline: EDD
  const baseline        = buildSchedule(byDue(orders), lines, matrix);
  const baselineMetrics = calcMetrics(baseline);

  // 6 permutations of family order
  const familyPerms = permutations(['LATEX', 'NON_LATEX', 'STANDARD']);
  const candidates  = familyPerms.map(perm => {
    const sched   = buildSchedule(byFamilyPerm(orders, perm), lines, matrix);
    const metrics = calcMetrics(sched);
    return { perm, sched, metrics };
  });

  // Include EDD baseline so result is never worse
  candidates.push({ perm: ['EDD'], sched: baseline, metrics: baselineMetrics });

  // Select best
  candidates.sort((a, b) => {
    if (a.metrics.totalLate     !== b.metrics.totalLate)     return a.metrics.totalLate     - b.metrics.totalLate;
    if (a.metrics.totalCleaning !== b.metrics.totalCleaning) return a.metrics.totalCleaning - b.metrics.totalCleaning;
    return a.metrics.overallFinish - b.metrics.overallFinish;
  });

  const { sched: best, metrics: bestMetrics, perm: bestPerm } = candidates[0];
  return { baseline, best, baselineMetrics, bestMetrics, bestPerm };
}

// ─── Impossible-deadline detection ───────────────────────────────────────────

export function getImpossibleWarnings(rawOrders, products, scheduleStart) {
  return enrichOrders(rawOrders, products, scheduleStart)
    .filter(o => o.duration > o.dueMins)
    .map(o => ({
      orderId: o.id,
      message: `${o.id} cannot meet its deadline: it needs ${o.duration} min but only ${Math.round(o.dueMins)} min are available from schedule start.`,
    }));
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate an order payload.
 * @param {object} order        - { id, productId, quantity, dueISO }
 * @param {object[]} products   - full product list
 * @param {string[]} existingIds - IDs already in the database (excluding the one being edited)
 */
export function validateOrderPayload(order, products, existingIds) {
  const errors = [];

  if (!order.id || !String(order.id).trim())
    errors.push('Order ID is required.');
  else if (existingIds.includes(String(order.id).trim()))
    errors.push(`Order ID "${order.id}" already exists.`);

  if (!products.find(p => p.id === order.productId))
    errors.push('Product not found.');

  const qty = parseInt(order.quantity, 10);
  if (!Number.isInteger(qty) || qty <= 0)
    errors.push('Quantity must be a positive integer.');

  if (!order.dueISO || isNaN(new Date(order.dueISO).getTime()))
    errors.push('Due date/time is required and must be a valid date.');

  return errors;
}
