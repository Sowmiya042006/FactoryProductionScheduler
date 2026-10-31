/**
 * server/routes/schedules.js
 * POST /api/schedules          – generate and persist a new schedule run
 * GET  /api/schedules/latest   – return the most recent run
 * GET  /api/schedules/:id      – return a specific run
 */
import { Router } from 'express';
import db from '../db.js';
import {
  dbGetLines, dbGetProducts, dbGetOrders, dbGetMatrix,
  dbGetScheduleStart, ok, fail,
} from '../helpers.js';
import {
  generateSchedules, getImpossibleWarnings,
} from '../scheduler.js';

const router = Router();

// ─── Helper: serialize a schedule row for DB storage ─────────────────────────
function rowToAssignment(row, scheduleType, runId) {
  return {
    run_id:              runId,
    schedule_type:       scheduleType,
    order_id:            row.id,
    product_id:          row.productId,
    product_name:        row.product?.name ?? '',
    product_family:      row.product?.family ?? '',
    line_id:             row.lineId,
    line_name:           row.lineName,
    quantity:            row.quantity,
    duration:            row.duration,
    cleaning:            row.cleaning,
    setup_start:         row.setupStart,
    prod_start:          row.prodStart,
    finish:              row.finish,
    due_mins:            row.dueMins,
    due_iso:             row.dueISO,
    lateness:            row.lateness,
    is_late:             row.isLate ? 1 : 0,
    impossible_deadline: row.impossibleDeadline ? 1 : 0,
  };
}

// ─── Helper: rehydrate assignments into frontend-compatible objects ───────────
function hydrate(assignments) {
  return assignments.map(a => ({
    id:                 a.order_id,
    productId:          a.product_id,
    quantity:           a.quantity,
    dueISO:             a.due_iso,
    product: {
      id:            a.product_id,
      name:          a.product_name,
      family:        a.product_family,
      eligibleLines: [], // not needed on the result side
    },
    lineId:             a.line_id,
    lineName:           a.line_name,
    duration:           a.duration,
    cleaning:           a.cleaning,
    setupStart:         a.setup_start,
    prodStart:          a.prod_start,
    finish:             a.finish,
    dueMins:            a.due_mins,
    dueDate:            a.due_iso,   // ISO string; frontend reconstructs Date
    lateness:           a.lateness,
    isLate:             a.is_late === 1,
    impossibleDeadline: a.impossible_deadline === 1,
  }));
}

// ─── POST /api/schedules ──────────────────────────────────────────────────────
router.post('/', (_req, res) => {
  const lines         = dbGetLines();
  const products      = dbGetProducts();
  const rawOrders     = dbGetOrders();
  const matrix        = dbGetMatrix();
  const scheduleStart = dbGetScheduleStart();

  const { baseline, best, baselineMetrics, bestMetrics, bestPerm } =
    generateSchedules(rawOrders, products, lines, matrix, scheduleStart);

  const warnings = getImpossibleWarnings(rawOrders, products, scheduleStart);

  // Persist atomically
  const insertRun = db.prepare(`
    INSERT INTO schedule_runs
      (created_at, schedule_start, orders_snapshot, baseline_metrics, best_metrics, best_perm)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAssignment = db.prepare(`
    INSERT INTO schedule_assignments
      (run_id, schedule_type, order_id, product_id, product_name, product_family,
       line_id, line_name, quantity, duration, cleaning, setup_start, prod_start,
       finish, due_mins, due_iso, lateness, is_late, impossible_deadline)
    VALUES
      (@run_id, @schedule_type, @order_id, @product_id, @product_name, @product_family,
       @line_id, @line_name, @quantity, @duration, @cleaning, @setup_start, @prod_start,
       @finish, @due_mins, @due_iso, @lateness, @is_late, @impossible_deadline)
  `);

  let runId;
  db.transaction(() => {
    const info = insertRun.run(
      new Date().toISOString(),
      scheduleStart.toISOString(),
      JSON.stringify(rawOrders.map(o => ({ id: o.id, product_id: o.product_id, quantity: o.quantity, due_iso: o.due_iso }))),
      JSON.stringify(baselineMetrics),
      JSON.stringify(bestMetrics),
      JSON.stringify(bestPerm)
    );
    runId = info.lastInsertRowid;

    for (const row of baseline) {
      insertAssignment.run(rowToAssignment(row, 'baseline', runId));
    }
    for (const row of best) {
      insertAssignment.run(rowToAssignment(row, 'best', runId));
    }
  })();

  ok(res, {
    runId,
    scheduleStart: scheduleStart.toISOString(),
    baseline:      hydrate(baseline.map(r => rowToAssignment(r, 'baseline', runId))),
    best:          hydrate(best.map(r => rowToAssignment(r, 'best', runId))),
    baselineMetrics,
    bestMetrics,
    warnings,
  }, 201);
});

// ─── GET /api/schedules/latest ────────────────────────────────────────────────
router.get('/latest', (_req, res) => {
  const run = db.prepare('SELECT * FROM schedule_runs ORDER BY id DESC LIMIT 1').get();
  if (!run) return ok(res, null);

  const baselineRows = db
    .prepare("SELECT * FROM schedule_assignments WHERE run_id = ? AND schedule_type = 'baseline' ORDER BY prod_start")
    .all(run.id);
  const bestRows = db
    .prepare("SELECT * FROM schedule_assignments WHERE run_id = ? AND schedule_type = 'best' ORDER BY prod_start")
    .all(run.id);

  const warnings = (() => {
    const rawOrders = dbGetOrders();
    const products  = dbGetProducts();
    const start     = dbGetScheduleStart();
    return getImpossibleWarnings(rawOrders, products, start);
  })();

  ok(res, {
    runId:           run.id,
    createdAt:       run.created_at,
    scheduleStart:   run.schedule_start,
    ordersSnapshot:  JSON.parse(run.orders_snapshot),
    baselineMetrics: JSON.parse(run.baseline_metrics),
    bestMetrics:     JSON.parse(run.best_metrics),
    bestPerm:        JSON.parse(run.best_perm),
    baseline:        hydrate(baselineRows),
    best:            hydrate(bestRows),
    warnings,
  });
});

// ─── GET /api/schedules/:id ───────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const run = db.prepare('SELECT * FROM schedule_runs WHERE id = ?').get(req.params.id);
  if (!run) return fail(res, `Schedule run ${req.params.id} not found.`, 404);

  const baselineRows = db
    .prepare("SELECT * FROM schedule_assignments WHERE run_id = ? AND schedule_type = 'baseline' ORDER BY prod_start")
    .all(run.id);
  const bestRows = db
    .prepare("SELECT * FROM schedule_assignments WHERE run_id = ? AND schedule_type = 'best' ORDER BY prod_start")
    .all(run.id);

  ok(res, {
    runId:           run.id,
    createdAt:       run.created_at,
    scheduleStart:   run.schedule_start,
    ordersSnapshot:  JSON.parse(run.orders_snapshot),
    baselineMetrics: JSON.parse(run.baseline_metrics),
    bestMetrics:     JSON.parse(run.best_metrics),
    bestPerm:        JSON.parse(run.best_perm),
    baseline:        hydrate(baselineRows),
    best:            hydrate(bestRows),
  });
});

export default router;
