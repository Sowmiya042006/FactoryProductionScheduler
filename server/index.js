/**
 * server/index.js  – Express application entry point
 *
 * Development: Vite dev server proxies /api/* to this process (port 3001).
 * Production:  This server also serves the built frontend from dist/.
 */
import 'dotenv/config';
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Initialise DB (runs schema + seed on first run)
import './db.js';

import catalogRoutes  from './routes/catalog.js';
import ordersRoutes   from './routes/orders.js';
import settingsRoutes from './routes/settings.js';
import scheduleRoutes from './routes/schedules.js';
import demoRoutes     from './routes/demo.js';
import { errorHandler } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT      = parseInt(process.env.PORT ?? '3001', 10);
const app       = express();

app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api', catalogRoutes);
app.use('/api/orders',    ordersRoutes);
app.use('/api/settings',  settingsRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/demo',      demoRoutes);

// ─── Production: serve Vite build ─────────────────────────────────────────────
const distDir = join(__dirname, '../dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

// ─── Centralized error handler ────────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[server] FlowPlan API listening on http://localhost:${PORT}`);
  console.log(`[server] DB: ${process.env.DB_PATH ?? './data/flowplan.db'}`);
});
