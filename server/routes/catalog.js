// server/routes/catalog.js  – GET /api/lines, /api/products, /api/changeovers
import { Router } from 'express';
import db from '../db.js';
import { dbGetLines, dbGetProducts, ok } from '../helpers.js';

const router = Router();

router.get('/lines', (_req, res) => {
  ok(res, dbGetLines());
});

router.get('/products', (_req, res) => {
  ok(res, dbGetProducts());
});

router.get('/changeovers', (_req, res) => {
  const rows = db.prepare(
    'SELECT from_family, to_family, minutes FROM changeovers ORDER BY from_family, to_family'
  ).all();
  ok(res, rows);
});

export default router;
