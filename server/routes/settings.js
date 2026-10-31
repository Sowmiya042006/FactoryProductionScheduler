// server/routes/settings.js – GET/PUT /api/settings
import { Router } from 'express';
import db from '../db.js';
import { ok, fail } from '../helpers.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  ok(res, settings);
});

router.put('/', (req, res) => {
  const { schedule_start } = req.body ?? {};

  if (schedule_start !== undefined) {
    if (!schedule_start || isNaN(new Date(schedule_start).getTime())) {
      return fail(res, 'schedule_start must be a valid ISO date-time string.', 422);
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('schedule_start', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(schedule_start);
  }

  const rows = db.prepare('SELECT key, value FROM settings').all();
  ok(res, Object.fromEntries(rows.map(r => [r.key, r.value])));
});

export default router;
