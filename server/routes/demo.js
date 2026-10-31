/**
 * server/routes/demo.js
 * POST /api/demo/reset  – wipe and re-seed the demo dataset
 * POST /api/demo/import – import orders from a localStorage snapshot
 */
import { Router } from 'express';
import db from '../db.js';
import { dbGetProducts, ok, fail } from '../helpers.js';
import { validateOrderPayload } from '../scheduler.js';

const router = Router();

// ─── POST /api/demo/reset ─────────────────────────────────────────────────────
router.post('/reset', (_req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM schedule_assignments').run();
    db.prepare('DELETE FROM schedule_runs').run();
    db.prepare('DELETE FROM orders').run();
    db.prepare("UPDATE settings SET value = '2026-11-02T08:00:00' WHERE key = 'schedule_start'").run();

    const insertOrder = db.prepare(
      'INSERT INTO orders (id, product_id, quantity, due_iso) VALUES (?, ?, ?, ?)'
    );
    const defaultOrders = [
      ['O01','P1',20,'2026-11-02T08:30:00'],
      ['O02','P4',10,'2026-11-02T09:00:00'],
      ['O03','P7',20,'2026-11-02T09:15:00'],
      ['O04','P3',10,'2026-11-02T10:00:00'],
      ['O05','P2',10,'2026-11-02T10:15:00'],
      ['O06','P5',20,'2026-11-02T10:30:00'],
      ['O07','P6',10,'2026-11-02T11:00:00'],
      ['O08','P1',10,'2026-11-02T11:30:00'],
      ['O09','P4',15,'2026-11-02T12:00:00'],
      ['O10','P7',15,'2026-11-02T12:15:00'],
      ['O11','P3',20,'2026-11-02T13:00:00'],
      ['O12','P2',15,'2026-11-02T14:00:00'],
    ];
    for (const [id, pid, qty, due] of defaultOrders) {
      insertOrder.run(id, pid, qty, due);
    }
  })();

  ok(res, { message: 'Demo data restored.' });
});

// ─── POST /api/demo/import ────────────────────────────────────────────────────
// Body: { orders: [{ id, productId, quantity, dueISO }] }
router.post('/import', (req, res) => {
  const incoming = req.body?.orders;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return fail(res, 'No orders provided.', 422);
  }

  const products = dbGetProducts();
  const existingIds = db.prepare('SELECT id FROM orders').all().map(r => r.id);

  // Validate all first (all-or-nothing)
  const conflicts = [];
  const validationErrors = [];

  for (const o of incoming) {
    if (existingIds.includes(String(o.id ?? '').trim())) {
      conflicts.push(o.id);
    }
    const errs = validateOrderPayload(
      { id: o.id, productId: o.productId, quantity: o.quantity, dueISO: o.dueISO },
      products,
      // Pass empty so we validate everything except uniqueness (we handle that above)
      []
    );
    if (errs.length) validationErrors.push(`${o.id}: ${errs.join(', ')}`);
  }

  if (conflicts.length > 0) {
    return fail(
      res,
      `Cannot import: the following order IDs already exist in the database: ${conflicts.join(', ')}. Delete them first or use the demo reset.`,
      409
    );
  }

  if (validationErrors.length > 0) {
    return fail(res, `Validation failed:\n${validationErrors.join('\n')}`, 422);
  }

  // Import transactionally
  const insertOrder = db.prepare(
    'INSERT INTO orders (id, product_id, quantity, due_iso) VALUES (?, ?, ?, ?)'
  );

  db.transaction(() => {
    for (const o of incoming) {
      insertOrder.run(
        String(o.id).trim(),
        o.productId,
        parseInt(o.quantity, 10),
        o.dueISO
      );
    }
  })();

  ok(res, { imported: incoming.length });
});

export default router;
