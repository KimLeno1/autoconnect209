import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Initializes a SQLite database connection using better-sqlite3 and ensures
 * the 'vehicles' table schema (with make, model, year, price, location, and mileage)
 * along with all supporting marketplace tables are created.
 */
export function initializeDatabase(customPath = process.env.DATABASE_PATH || './data/apex.sqlite') {
  const isMemory = customPath === ':memory:';
  const dbPath = isMemory ? ':memory:' : resolve(root, customPath);

  if (!isMemory) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Ensure the core vehicles table schema with make, model, year, price, location, and mileage exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      dealer_id TEXT,
      category_id INTEGER,
      make_id INTEGER,
      model_id INTEGER,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      trim TEXT NOT NULL DEFAULT '',
      year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
      price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
      price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
      currency TEXT NOT NULL DEFAULT 'GHS',
      location TEXT NOT NULL DEFAULT '',
      mileage INTEGER NOT NULL DEFAULT 0 CHECK (mileage >= 0),
      fuel TEXT NOT NULL DEFAULT 'Petrol',
      transmission TEXT NOT NULL DEFAULT 'Automatic',
      engine TEXT NOT NULL DEFAULT '',
      engine_cc INTEGER,
      drivetrain TEXT NOT NULL DEFAULT '',
      body_type TEXT NOT NULL DEFAULT '',
      exterior TEXT NOT NULL DEFAULT '',
      interior TEXT NOT NULL DEFAULT '',
      doors INTEGER NOT NULL DEFAULT 4,
      seats INTEGER NOT NULL DEFAULT 5,
      condition TEXT NOT NULL DEFAULT 'Used' CHECK (condition IN ('New','Used','Certified')),
      accident_history TEXT NOT NULL DEFAULT 'Not supplied',
      ownership_history TEXT NOT NULL DEFAULT 'Not supplied',
      registration_status TEXT NOT NULL DEFAULT 'Not supplied',
      import_status TEXT NOT NULL DEFAULT 'Not supplied',
      vin TEXT,
      city TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      listing_data TEXT NOT NULL DEFAULT '{}',
      allow_offers INTEGER NOT NULL DEFAULT 0 CHECK (allow_offers IN (0,1)),
      offer_min_minor INTEGER,
      offer_max_minor INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','active','paused','reserved','sold','rejected')),
      is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  // Execute the full marketplace schema
  const schemaPath = join(root, 'schema.sql');
  db.exec(readFileSync(schemaPath, 'utf8'));

  // Ensure columns exist on pre-existing SQLite database files
  const ensureColumn = (table, name, definition) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(column => column.name === name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  };

  ensureColumn('vehicles', 'price', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('vehicles', 'location', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('vehicles', 'deleted_at', 'TEXT');
  ensureColumn('vehicles', 'engine_cc', 'INTEGER');
  ensureColumn('vehicles', 'body_type', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('vehicles', 'listing_data', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('vehicles', 'allow_offers', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('vehicles', 'offer_min_minor', 'INTEGER');
  ensureColumn('vehicles', 'offer_max_minor', 'INTEGER');
  ensureColumn('enquiries', 'original_message', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('enquiries', 'admin_status', "TEXT NOT NULL DEFAULT 'pending_admin'");
  ensureColumn('enquiries', 'forwarded_to_seller', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('enquiries', 'admin_notes', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('enquiries', 'reviewed_by', 'TEXT');
  ensureColumn('enquiries', 'forwarded_at', 'TEXT');

  // Backfill price and location from price_minor and city/country when empty
  db.exec(`
    UPDATE vehicles
    SET price = ROUND(price_minor / 100.0, 2)
    WHERE price = 0 AND price_minor > 0;

    UPDATE vehicles
    SET location = CASE
      WHEN city != '' AND country != '' THEN city || ', ' || country
      WHEN city != '' THEN city
      ELSE country
    END
    WHERE location = '' AND (city != '' OR country != '');

    UPDATE enquiries
    SET original_message = message
    WHERE original_message = '' AND message != '';
  `);

  return db;
}

export default initializeDatabase;
