// server/routes/orders.js – CRUD for /api/orders
import { Router } from 'express';
import db from '../db.js';
import { dbGetProducts, ok, fail } from '../helpers.js';
import { validateOrderPayload } from '../scheduler.js';

const router = Router();

// ─── GET /api/orders ──────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT id, product_id, quantity, due_iso FROM orders ORDER BY id')
    .all();
  // Normalize to camelCase for the frontend
  ok(res, rows.map(r => ({ id: r.id, productId: r.product_id, quantity: r.quantity, dueISO: r.due_iso })));
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { id, productId, quantity, dueISO } = req.body ?? {};
  const products    = dbGetProducts();
  const existingIds = db.prepare('SELECT id FROM orders').all().map(r => r.id);

  const errors = validateOrderPayload({ id, productId, quantity, dueISO }, products, existingIds);
  if (errors.length) return fail(res, errors.join(' '), 422);

  db.prepare('INSERT INTO orders (id, product_id, quantity, due_iso) VALUES (?, ?, ?, ?)')
    .run(id.trim(), productId, parseInt(quantity, 10), dueISO);

  ok(res, { id: id.trim(), productId, quantity: parseInt(quantity, 10), dueISO }, 201);
});

// ─── PUT /api/orders/:id ──────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, `Order "${req.params.id}" not found.`, 404);

  const { productId, quantity, dueISO } = req.body ?? {};
  const products = dbGetProducts();
  // Exclude the current ID from uniqueness check (it's being edited, not added)
  const otherIds = db
    .prepare('SELECT id FROM orders WHERE id != ?')
    .all(req.params.id)
    .map(r => r.id);

  // Re-use id field for display in validation but don't require uniqueness check
  const errors = validateOrderPayload(
    { id: req.params.id, productId, quantity, dueISO },
    products,
    otherIds   // existing IDs *excluding* this one → no false duplicate error
  );
  // Filter out the "already exists" error since we're editing
  const realErrors = errors.filter(e => !e.includes('already exists'));
  if (realErrors.length) return fail(res, realErrors.join(' '), 422);

  db.prepare('UPDATE orders SET product_id = ?, quantity = ?, due_iso = ? WHERE id = ?')
    .run(productId, parseInt(quantity, 10), dueISO, req.params.id);

  ok(res, { id: req.params.id, productId, quantity: parseInt(quantity, 10), dueISO });
});

// ─── DELETE /api/orders/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, `Order "${req.params.id}" not found.`, 404);

  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  ok(res, { deleted: req.params.id });
});

export default router;
