/**
 * server/db.js
 * Opens (or creates) the SQLite database, applies the schema, and seeds
 * the demo dataset exactly once (guarded by a db_meta flag).
 *
 * Timezone convention
 * -------------------
 * All due_iso / schedule_start values are stored as ISO-8601 strings WITHOUT
 * a timezone offset (e.g. "2026-11-02T08:30:00"). Node.js and browsers both
 * parse these as LOCAL time, which matches the "factory local time" convention
 * used throughout the application.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

const DB_PATH = process.env.DB_PATH ?? './data/flowplan.db';

// Ensure the data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance + safety pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS db_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lines (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS product_families (
    family TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS products (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    family        TEXT NOT NULL REFERENCES product_families(family),
    mins_per_unit INTEGER NOT NULL CHECK(mins_per_unit > 0)
  );

  CREATE TABLE IF NOT EXISTS product_line_eligibility (
    product_id TEXT NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
    line_id    TEXT NOT NULL REFERENCES lines(id)     ON DELETE CASCADE,
    PRIMARY KEY (product_id, line_id)
  );

  CREATE TABLE IF NOT EXISTS changeovers (
    from_family TEXT NOT NULL REFERENCES product_families(family),
    to_family   TEXT NOT NULL REFERENCES product_families(family),
    minutes     INTEGER NOT NULL CHECK(minutes >= 0),
    PRIMARY KEY (from_family, to_family)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity   INTEGER NOT NULL CHECK(quantity > 0),
    due_iso    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_runs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at       TEXT NOT NULL,
    schedule_start   TEXT NOT NULL,
    orders_snapshot  TEXT NOT NULL,
    baseline_metrics TEXT NOT NULL,
    best_metrics     TEXT NOT NULL,
    best_perm        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedule_assignments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id              INTEGER NOT NULL REFERENCES schedule_runs(id) ON DELETE CASCADE,
    schedule_type       TEXT NOT NULL CHECK(schedule_type IN ('baseline','best')),
    order_id            TEXT NOT NULL,
    product_id          TEXT NOT NULL,
    product_name        TEXT NOT NULL,
    product_family      TEXT NOT NULL,
    line_id             TEXT NOT NULL,
    line_name           TEXT NOT NULL,
    quantity            INTEGER NOT NULL,
    duration            INTEGER NOT NULL,
    cleaning            INTEGER NOT NULL,
    setup_start         REAL NOT NULL,
    prod_start          REAL NOT NULL,
    finish              REAL NOT NULL,
    due_mins            REAL NOT NULL,
    due_iso             TEXT NOT NULL,
    lateness            REAL NOT NULL,
    is_late             INTEGER NOT NULL,
    impossible_deadline INTEGER NOT NULL
  );
`);

// ─── One-time seed ────────────────────────────────────────────────────────────

const alreadySeeded = db
  .prepare("SELECT value FROM db_meta WHERE key = 'seeded'")
  .get();

if (!alreadySeeded) {
  db.transaction(() => {
    // Lines
    const insertLine = db.prepare('INSERT INTO lines (id, name) VALUES (?, ?)');
    insertLine.run('L1', 'Moulding');
    insertLine.run('L2', 'Assembly');
    insertLine.run('L3', 'Packing');

    // Families
    const insertFamily = db.prepare('INSERT INTO product_families (family) VALUES (?)');
    insertFamily.run('LATEX');
    insertFamily.run('NON_LATEX');
    insertFamily.run('STANDARD');

    // Products
    const insertProduct = db.prepare(
      'INSERT INTO products (id, name, family, mins_per_unit) VALUES (?, ?, ?, ?)'
    );
    insertProduct.run('P1', 'Latex seal',         'LATEX',     3);
    insertProduct.run('P2', 'Latex component',    'LATEX',     4);
    insertProduct.run('P3', 'Non-latex seal',     'NON_LATEX', 3);
    insertProduct.run('P4', 'Non-latex kit',      'NON_LATEX', 4);
    insertProduct.run('P5', 'Standard component', 'STANDARD',  2);
    insertProduct.run('P6', 'Standard kit',       'STANDARD',  3);
    insertProduct.run('P7', 'Standard carton',    'STANDARD',  2);

    // Product-line eligibility
    const insertElig = db.prepare(
      'INSERT INTO product_line_eligibility (product_id, line_id) VALUES (?, ?)'
    );
    insertElig.run('P1', 'L1');
    insertElig.run('P2', 'L1'); insertElig.run('P2', 'L2');
    insertElig.run('P3', 'L1');
    insertElig.run('P4', 'L2'); insertElig.run('P4', 'L3');
    insertElig.run('P5', 'L1'); insertElig.run('P5', 'L2');
    insertElig.run('P6', 'L2'); insertElig.run('P6', 'L3');
    insertElig.run('P7', 'L3');

    // Changeover matrix
    const insertCO = db.prepare(
      'INSERT INTO changeovers (from_family, to_family, minutes) VALUES (?, ?, ?)'
    );
    const matrix = {
      LATEX:     { LATEX: 0,  NON_LATEX: 60, STANDARD: 60 },
      NON_LATEX: { LATEX: 20, NON_LATEX: 0,  STANDARD: 15 },
      STANDARD:  { LATEX: 20, NON_LATEX: 15, STANDARD: 0  },
    };
    for (const [from, row] of Object.entries(matrix)) {
      for (const [to, mins] of Object.entries(row)) {
        insertCO.run(from, to, mins);
      }
    }

    // Default orders
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

    // Default settings
    db.prepare("INSERT INTO settings (key, value) VALUES ('schedule_start', '2026-11-02T08:00:00')").run();

    // Mark as seeded
    db.prepare("INSERT INTO db_meta (key, value) VALUES ('seeded', '1')").run();
  })();

  console.log('[db] Schema created and demo data seeded.');
} else {
  console.log('[db] Existing database opened (seed skipped).');
}

export default db;
