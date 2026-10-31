/**
 * server/helpers.js
 * Shared helpers: load full product/line/matrix data from db,
 * consistent JSON response wrappers, and centralized error handling.
 */

import db from './db.js';

// ─── Data loaders ─────────────────────────────────────────────────────────────

/** Load all lines from DB */
export function dbGetLines() {
  return db.prepare('SELECT id, name FROM lines ORDER BY id').all();
}

/** Load all products from DB with their eligible lines as an array */
export function dbGetProducts() {
  const products = db
    .prepare('SELECT id, name, family, mins_per_unit FROM products ORDER BY id')
    .all();

  const eligMap = {};
  db.prepare('SELECT product_id, line_id FROM product_line_eligibility ORDER BY product_id, line_id')
    .all()
    .forEach(r => {
      eligMap[r.product_id] = eligMap[r.product_id] ?? [];
      eligMap[r.product_id].push(r.line_id);
    });

  return products.map(p => ({
    id:            p.id,
    name:          p.name,
    family:        p.family,
    minsPerUnit:   p.mins_per_unit,
    eligibleLines: eligMap[p.id] ?? [],
  }));
}

/** Load changeover matrix as { FROM: { TO: minutes } } */
export function dbGetMatrix() {
  const rows = db.prepare('SELECT from_family, to_family, minutes FROM changeovers').all();
  const matrix = {};
  for (const r of rows) {
    matrix[r.from_family] = matrix[r.from_family] ?? {};
    matrix[r.from_family][r.to_family] = r.minutes;
  }
  return matrix;
}

/** Load all orders from DB */
export function dbGetOrders() {
  return db
    .prepare('SELECT id, product_id, quantity, due_iso FROM orders ORDER BY id')
    .all();
}

/** Get a setting value (returns the string or null) */
export function dbGetSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

/** Get schedule_start as a Date object */
export function dbGetScheduleStart() {
  const val = dbGetSetting('schedule_start') ?? '2026-11-02T08:00:00';
  return new Date(val);
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}

export function fail(res, message, status = 400) {
  return res.status(status).json({ ok: false, error: message });
}

// ─── Central error handler (use as Express error middleware) ──────────────────

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  console.error('[error]', err.message);
  // Never expose raw SQL errors or stack traces to the client
  return res.status(500).json({ ok: false, error: 'Internal server error. Please try again.' });
}
