import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from './db.mjs';

const nowIso = () => new Date().toISOString();
const sha256 = value => createHash('sha256').update(String(value)).digest('hex');

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    String(cookieHeader)
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const idx = part.indexOf('=');
        return idx === -1 ? [part, ''] : [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

/**
 * Creates an Express application connected to the SQLite database (better-sqlite3)
 * and implements:
 *  - Public & catalog endpoints: GET/POST/PUT/DELETE /api/vehicles
 *  - Complete Supplier / Dealer Panel backend: /api/supplier/*
 *  - Complete Admin Panel backend: /api/admin/panel, /api/admin/summary, /api/admin/suppliers/*, etc.
 */
export function createExpressApp(customDbOrPath) {
  const db =
    customDbOrPath && typeof customDbOrPath.prepare === 'function'
      ? customDbOrPath
      : initializeDatabase(customDbOrPath);

  // Ensure operational tables exist when Express app is used standalone
  db.exec(`
    CREATE TABLE IF NOT EXISTS operations_records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS seller_operations (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE TABLE IF NOT EXISTS seller_operation_history (
      id TEXT PRIMARY KEY,
      record_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seller_identity (
      seller_id TEXT PRIMARY KEY REFERENCES users(id),
      provider TEXT NOT NULL DEFAULT 'stripe_identity',
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'not_started',
      reason TEXT NOT NULL DEFAULT '',
      last_event INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      livemode INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS listing_fee_payments (
      reference TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL REFERENCES users(id),
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      livemode INTEGER NOT NULL DEFAULT 0,
      checkout_url TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
    CREATE TABLE IF NOT EXISTS vehicle_offers (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      buyer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      seller_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      buyer_name TEXT NOT NULL DEFAULT '',
      buyer_email TEXT NOT NULL DEFAULT '',
      amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
      currency TEXT NOT NULL DEFAULT 'GHS',
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','countered')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS idx_vehicle_offers_vehicle ON vehicle_offers(vehicle_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_vehicle_offers_seller ON vehicle_offers(seller_id, status, created_at DESC);
  `);

  const ensureTableCol = (table, name, definition) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.length && !cols.some(c => c.name === name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  };
  ensureTableCol('vehicles', 'allow_offers', 'INTEGER NOT NULL DEFAULT 0');
  ensureTableCol('vehicles', 'offer_min_minor', 'INTEGER');
  ensureTableCol('vehicles', 'offer_max_minor', 'INTEGER');
  ensureTableCol('vehicles', 'allow_deposit', 'INTEGER NOT NULL DEFAULT 1');
  ensureTableCol('vehicles', 'deposit_amount_minor', 'INTEGER');
  ensureTableCol('enquiries', 'original_message', "TEXT NOT NULL DEFAULT ''");
  ensureTableCol('enquiries', 'admin_status', "TEXT NOT NULL DEFAULT 'pending_admin'");
  ensureTableCol('enquiries', 'forwarded_to_seller', 'INTEGER NOT NULL DEFAULT 0');
  ensureTableCol('enquiries', 'admin_notes', "TEXT NOT NULL DEFAULT ''");
  ensureTableCol('enquiries', 'reviewed_by', 'TEXT');
  ensureTableCol('enquiries', 'forwarded_at', 'TEXT');

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  function resolveSessionUser(req) {
    const token = parseCookies(req.headers.cookie).apex_session;
    if (token) {
      const row = db
        .prepare(
          `SELECT u.id, u.email, u.role, u.status, u.email_verified, s.csrf_token, s.expires_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.id_hash = ?`
        )
        .get(sha256(token));
      if (row && row.status === 'active' && Date.parse(row.expires_at) >= Date.now()) {
        return row;
      }
    }
    return null;
  }

  function resolveSupplierId(req) {
    const user = resolveSessionUser(req);
    if (user && (user.role === 'dealer' || user.role === 'admin')) {
      if (user.role === 'dealer') return user.id;
      if (req.query?.supplierId || req.body?.supplierId) {
        return String(req.query.supplierId || req.body?.supplierId);
      }
    }
    const explicitId = req.headers['x-supplier-id'] || req.query?.supplierId || req.body?.supplierId;
    if (explicitId) {
      const found = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dealer'").get(String(explicitId));
      if (found) return found.id;
    }
    const defaultDealer = db
      .prepare("SELECT id FROM users WHERE role = 'dealer' AND status = 'active' ORDER BY created_at ASC LIMIT 1")
      .get();
    return defaultDealer?.id || null;
  }

  function resolveAdminActor(req) {
    const user = resolveSessionUser(req);
    if (user && user.role === 'admin') return user;
    const defaultAdmin = db
      .prepare("SELECT id, email, role FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at ASC LIMIT 1")
      .get();
    return defaultAdmin || { id: null, email: 'admin@autoconnect.gh', role: 'admin' };
  }

  function recordAuditLog(actorId, action, subjectType, subjectId, details = {}) {
    try {
      db.prepare(
        'INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), actorId || null, action, subjectType, String(subjectId || ''), JSON.stringify(details), nowIso());
    } catch {}
  }

  function addNotification(userId, kind, message) {
    if (!userId) return;
    try {
      db.prepare('INSERT INTO notifications (id, user_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
        randomUUID(),
        userId,
        kind,
        message,
        nowIso()
      );
    } catch {}
  }

  const getImagesStmt = db.prepare(
    'SELECT id, image_url AS url, alt_text AS alt, sort_order FROM vehicle_images WHERE vehicle_id = ? ORDER BY sort_order ASC'
  );

  function parseOfferConfig(body = {}, existingRow = null) {
    const listingData = body.listingData && typeof body.listingData === 'object' ? body.listingData : {};
    const rawAllow =
      body.allowOffers ??
      body.allow_offers ??
      listingData.allowOffers ??
      (existingRow ? Boolean(existingRow.allow_offers) : false);
    const allowOffers = rawAllow === true || rawAllow === 1 || rawAllow === '1' || rawAllow === 'true' ? 1 : 0;

    if (!allowOffers) {
      return { allowOffers: 0, offerMinMinor: null, offerMaxMinor: null };
    }

    const parseMinorValue = (majorVal, minorVal, fallbackMinor = null) => {
      if (minorVal !== undefined && minorVal !== null && minorVal !== '') {
        const n = Number(minorVal);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      }
      if (majorVal !== undefined && majorVal !== null && majorVal !== '') {
        const n = Number(majorVal);
        return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
      }
      return fallbackMinor;
    };

    const offerMinMinor = parseMinorValue(
      body.offerMinPrice ?? listingData.offerMinPrice,
      body.offer_min_minor ?? listingData.offer_min_minor,
      existingRow?.offer_min_minor ?? null
    );
    const offerMaxMinor = parseMinorValue(
      body.offerMaxPrice ?? listingData.offerMaxPrice,
      body.offer_max_minor ?? listingData.offer_max_minor,
      existingRow?.offer_max_minor ?? null
    );

    if (offerMinMinor !== null && offerMaxMinor !== null && offerMinMinor > offerMaxMinor) {
      const err = new Error('Minimum offer price cannot exceed maximum offer price.');
      err.status = 400;
      throw err;
    }

    return { allowOffers, offerMinMinor, offerMaxMinor };
  }

  function parseDepositConfig(body = {}, existingRow = null, askingPriceMajor = 0) {
    const listingData = body.listingData && typeof body.listingData === 'object' ? body.listingData : {};
    let existingLd = {};
    if (existingRow?.listing_data) {
      try { existingLd = JSON.parse(existingRow.listing_data); } catch {}
    }
    const rawAllow =
      body.allowDeposit ??
      body.allow_deposit ??
      listingData.allowDeposit ??
      (existingRow && existingRow.allow_deposit !== undefined && existingRow.allow_deposit !== null
        ? Boolean(existingRow.allow_deposit)
        : existingLd.allowDeposit !== undefined
          ? Boolean(existingLd.allowDeposit)
          : true);
    const allowDeposit = rawAllow === false || rawAllow === 0 || rawAllow === '0' || rawAllow === 'false' ? 0 : 1;
    if (!allowDeposit) {
      return { allowDeposit: 0, depositAmountMinor: null, depositAmountMajor: null };
    }
    const rawMinor = body.deposit_amount_minor ?? listingData.deposit_amount_minor;
    const rawMajor = body.depositAmount ?? body.deposit_amount ?? listingData.depositAmount;
    let depositAmountMinor = null;
    if (rawMinor !== undefined && rawMinor !== null && rawMinor !== '') {
      const n = Number(rawMinor);
      if (!Number.isFinite(n) || n <= 0) {
        const err = new Error('Enter a valid reservation deposit amount greater than zero.');
        err.status = 400;
        throw err;
      }
      depositAmountMinor = Math.round(n);
    } else if (rawMajor !== undefined && rawMajor !== null && rawMajor !== '') {
      const n = Number(rawMajor);
      if (!Number.isFinite(n) || n <= 0) {
        const err = new Error('Enter a valid reservation deposit amount greater than zero.');
        err.status = 400;
        throw err;
      }
      depositAmountMinor = Math.round(n * 100);
    } else if (existingRow?.deposit_amount_minor && Number(existingRow.deposit_amount_minor) > 0) {
      depositAmountMinor = Math.round(Number(existingRow.deposit_amount_minor));
    } else if (askingPriceMajor > 0) {
      depositAmountMinor = Math.max(100, Math.round(askingPriceMajor * 0.10 * 100));
    }
    const priceMinor = Math.round(Number(askingPriceMajor || 0) * 100);
    if (depositAmountMinor !== null && priceMinor > 0 && depositAmountMinor >= priceMinor) {
      const err = new Error('Reservation deposit must be less than the vehicle asking price.');
      err.status = 400;
      throw err;
    }
    return {
      allowDeposit: 1,
      depositAmountMinor,
      depositAmountMajor: depositAmountMinor ? depositAmountMinor / 100 : null
    };
  }

  function evaluateOfferRangeStatus(amountMinor, minMinor, maxMinor) {
    if (!minMinor && !maxMinor) return 'no_range';
    if (minMinor && amountMinor < minMinor) return 'below_range';
    if (maxMinor && amountMinor > maxMinor) return 'above_range';
    return 'within_range';
  }

  function formatVehicleRow(row, options = {}) {
    if (!row) return null;
    const includePrivateOfferRange = Boolean(options && options.includePrivateOfferRange === true);
    const price =
      Number(row.price) > 0
        ? Number(row.price)
        : Number(row.price_minor) > 0
          ? Math.round(Number(row.price_minor)) / 100
          : 0;
    const location =
      row.location && String(row.location).trim()
        ? row.location
        : [row.city, row.country].filter(Boolean).join(', ');
    const paidRow = db
      .prepare("SELECT reference, status, amount_minor, currency, paid_at FROM listing_fee_payments WHERE vehicle_id = ? AND status = 'paid' LIMIT 1")
      .get(row.id);

    let parsedListingData = {};
    if (row.listing_data) {
      try {
        parsedListingData = JSON.parse(row.listing_data);
      } catch {
        parsedListingData = {};
      }
    }

    const allowOffers = Boolean(row.allow_offers || parsedListingData.allowOffers);
    const allowDeposit =
      row.allow_deposit !== undefined && row.allow_deposit !== null
        ? Boolean(row.allow_deposit)
        : parsedListingData.allowDeposit !== undefined
          ? Boolean(parsedListingData.allowDeposit)
          : true;
    const rawDepositMajor = row.deposit_amount_minor
      ? Math.round(Number(row.deposit_amount_minor)) / 100
      : Number(parsedListingData.depositAmount || 0);
    const depositAmount = allowDeposit
      ? rawDepositMajor > 0 && (price <= 0 || rawDepositMajor < price)
        ? rawDepositMajor
        : Math.max(1, Math.round(price * 0.10))
      : null;
    const { offer_min_minor, offer_max_minor, supplier_phone, listing_data, ...safeRow } = row;

    // Never expose the seller's hidden price range or direct contact details to public/buyer consumers
    const sanitizedListingData = { ...parsedListingData };
    delete sanitizedListingData.phone;
    delete sanitizedListingData.whatsapp;
    delete sanitizedListingData.email;
    delete sanitizedListingData.contactEmail;
    if (!includePrivateOfferRange) {
      delete sanitizedListingData.offerMinPrice;
      delete sanitizedListingData.offerMaxPrice;
      delete sanitizedListingData.offer_min_minor;
      delete sanitizedListingData.offer_max_minor;
    }

    const result = {
      ...safeRow,
      price,
      location,
      allow_offers: allowOffers ? 1 : 0,
      allowOffers,
      allow_deposit: allowDeposit ? 1 : 0,
      allowDeposit,
      deposit_amount_minor: allowDeposit && depositAmount ? Math.round(depositAmount * 100) : null,
      depositAmount,
      listingData: sanitizedListingData,
      is_demo: Boolean(row.is_demo),
      feePaid: Boolean(paidRow || row.is_demo),
      payment: paidRow || null,
      images: getImagesStmt.all(row.id)
    };

    if (includePrivateOfferRange) {
      result.offer_min_minor = offer_min_minor ?? null;
      result.offer_max_minor = offer_max_minor ?? null;
      result.offerMinPrice = offer_min_minor ? offer_min_minor / 100 : null;
      result.offerMaxPrice = offer_max_minor ? offer_max_minor / 100 : null;
    }

    return result;
  }

  function formatSupplierOfferRow(row) {
    const amount = Math.round(Number(row.amount_minor || 0)) / 100;
    const offerMinPrice = row.offer_min_minor ? Math.round(Number(row.offer_min_minor)) / 100 : null;
    const offerMaxPrice = row.offer_max_minor ? Math.round(Number(row.offer_max_minor)) / 100 : null;
    const withinRange = evaluateOfferRangeStatus(Number(row.amount_minor || 0), row.offer_min_minor, row.offer_max_minor);
    return {
      id: row.id,
      vehicle_id: row.vehicle_id,
      buyer_id: row.buyer_id,
      seller_id: row.seller_id,
      buyer_name: 'Verified Marketplace Buyer',
      buyer_email: '',
      amount,
      amount_minor: row.amount_minor,
      currency: row.currency || 'GHS',
      message: row.message || '',
      status: row.status,
      withinRange,
      isWithinRange: withinRange === 'within_range',
      offer_min_minor: row.offer_min_minor ?? null,
      offer_max_minor: row.offer_max_minor ?? null,
      offerMinPrice,
      offerMaxPrice,
      make: row.make,
      model: row.model,
      year: row.year,
      asking_price_minor: row.price_minor,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // ============================================================================
  // 1. VEHICLES ENDPOINTS (/api/vehicles)
  // ============================================================================
  app.get('/api/vehicles', (req, res) => {
    try {
      const statusFilter = req.query.status ? String(req.query.status) : 'active';
      const keyword = String(req.query.q || req.query.search || req.query.keyword || '').trim().toLowerCase();
      const whereClauses = ['v.deleted_at IS NULL'];
      const params = [];

      if (statusFilter !== 'all') {
        whereClauses.push('v.status = ?');
        params.push(statusFilter);
      }

      if (keyword) {
        const pattern = `%${keyword}%`;
        whereClauses.push(
          "(lower(v.make) LIKE ? OR lower(v.model) LIKE ? OR lower(v.trim) LIKE ? OR lower(v.make || ' ' || v.model) LIKE ?)"
        );
        params.push(pattern, pattern, pattern, pattern);
      }

      const rows = db
        .prepare(`
          SELECT
            v.id,
            v.dealer_id,
            v.make,
            v.model,
            v.trim,
            v.year,
            CASE WHEN v.price > 0 THEN v.price ELSE ROUND(v.price_minor / 100.0, 2) END AS price,
            v.price_minor,
            v.currency,
            CASE
              WHEN v.location != '' THEN v.location
              WHEN v.city != '' AND v.country != '' THEN v.city || ', ' || v.country
              ELSE v.city
            END AS location,
            v.mileage,
            v.fuel,
            v.transmission,
            v.engine,
            v.drivetrain,
            v.body_type,
            v.condition,
            v.city,
            v.country,
            v.description,
            v.listing_data,
            v.allow_offers,
            v.allow_deposit,
            v.deposit_amount_minor,
            v.status,
            v.is_demo,
            v.created_at,
            dp.business_name AS supplier_name
          FROM vehicles v
          LEFT JOIN dealer_profiles dp ON dp.user_id = v.dealer_id
          WHERE ${whereClauses.join(' AND ')}
          ORDER BY v.created_at DESC, v.id ASC
        `)
        .all(...params);

      const vehicles = rows.map(r => formatVehicleRow(r, { includePrivateOfferRange: false }));

      res.status(200).json({
        vehicles,
        items: vehicles,
        total: vehicles.length
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch vehicle listings.' });
    }
  });

  app.get('/api/vehicles/:id', (req, res) => {
    try {
      const row = db
        .prepare(
          `SELECT v.*, dp.business_name AS supplier_name, dp.city AS supplier_city
           FROM vehicles v
           LEFT JOIN dealer_profiles dp ON dp.user_id = v.dealer_id
           WHERE v.id = ? AND v.deleted_at IS NULL`
        )
        .get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Vehicle listing not found.' });
      return res.status(200).json({ vehicle: formatVehicleRow(row, { includePrivateOfferRange: false }) });
    } catch {
      return res.status(500).json({ error: 'Failed to load vehicle listing.' });
    }
  });

  app.post('/api/vehicles', (req, res) => {
    try {
      const b = req.body || {};
      const make = String(b.make || '').trim();
      const model = String(b.model || '').trim();
      const year = Number(b.year);
      const price = Number(b.price);
      const mileage = Number(b.mileage ?? 0);
      const location = String(b.location || b.city || 'Accra, Ghana').trim();

      if (!make || !model || !Number.isInteger(year) || year < 1900 || year > 2100) {
        return res.status(400).json({ error: 'Valid make, model, and year are required.' });
      }
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({ error: 'A valid positive price is required.' });
      }
      if (!Number.isFinite(mileage) || mileage < 0) {
        return res.status(400).json({ error: 'Mileage must be a non-negative number.' });
      }

      const { allowOffers, offerMinMinor, offerMaxMinor } = parseOfferConfig(b);
      const { allowDeposit, depositAmountMinor, depositAmountMajor } = parseDepositConfig(b, null, price);

      const vehicleId = b.id ? String(b.id) : randomUUID();
      const supplierId = b.dealer_id || resolveSupplierId(req);
      const currency = ['GHS', 'USD'].includes(b.currency) ? b.currency : 'GHS';
      const priceMinor = Math.round(price * 100);
      const [cityPart, countryPart] = location.includes(',')
        ? location.split(',').map(s => s.trim())
        : [String(b.city || location || 'Accra'), String(b.country || 'Ghana')];
      const status = ['active', 'pending', 'paused', 'sold', 'rejected'].includes(b.status) ? b.status : 'active';
      const t = nowIso();
      const listingDataObj = { ...(b.listingData && typeof b.listingData === 'object' ? b.listingData : {}) };
      delete listingDataObj.offerMinPrice;
      delete listingDataObj.offerMaxPrice;
      delete listingDataObj.offer_min_minor;
      delete listingDataObj.offer_max_minor;
      listingDataObj.allowOffers = Boolean(allowOffers);
      listingDataObj.allowDeposit = Boolean(allowDeposit);
      listingDataObj.depositAmount = depositAmountMajor;

      db.prepare(
        `INSERT INTO vehicles (
          id, dealer_id, make, model, trim, year, price, price_minor, currency, location, mileage,
          fuel, transmission, engine, drivetrain, body_type, exterior, interior, doors, seats,
          condition, city, country, description, listing_data, allow_offers, offer_min_minor, offer_max_minor,
          allow_deposit, deposit_amount_minor,
          status, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        vehicleId,
        supplierId || null,
        make,
        model,
        String(b.trim || ''),
        year,
        price,
        priceMinor,
        currency,
        location,
        Math.round(mileage),
        String(b.fuel || 'Petrol'),
        String(b.transmission || 'Automatic'),
        String(b.engine || ''),
        String(b.drivetrain || 'AWD'),
        String(b.body_type || b.bodyType || 'SUV'),
        String(b.exterior || 'Black'),
        String(b.interior || 'Black'),
        Number(b.doors || 4),
        Number(b.seats || 5),
        String(b.condition || 'Used'),
        cityPart || 'Accra',
        countryPart || 'Ghana',
        String(b.description || `${year} ${make} ${model} available in ${location}.`),
        JSON.stringify(listingDataObj),
        allowOffers,
        offerMinMinor,
        offerMaxMinor,
        allowDeposit,
        depositAmountMinor,
        status,
        b.is_demo ? 1 : 0,
        t,
        t
      );

      const rawImages = Array.isArray(b.images) && b.images.length
        ? b.images
        : Array.isArray(b.imageUrls) && b.imageUrls.length
          ? b.imageUrls
          : (b.imageUrl || b.image_url)
            ? [b.imageUrl || b.image_url]
            : [];
      const insertImgStmt = db.prepare(
        'INSERT INTO vehicle_images (id, vehicle_id, image_url, alt_text, sort_order) VALUES (?, ?, ?, ?, ?)'
      );
      rawImages.slice(0, 8).forEach((entry, idx) => {
        const urlStr = typeof entry === 'string' ? entry : entry?.url || entry?.image_url || '';
        const altStr = (typeof entry === 'object' && (entry?.alt || entry?.alt_text)) || `${year} ${make} ${model} — Photo ${idx + 1}`;
        if (urlStr) {
          insertImgStmt.run(randomUUID(), vehicleId, String(urlStr), String(altStr), idx);
        }
      });

      const created = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
      return res.status(201).json({ vehicle: formatVehicleRow(created, { includePrivateOfferRange: false }) });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Failed to create vehicle listing.' });
    }
  });

  // Buyer Offer Submission (never exposes seller's hidden offer price range)
  const handleCreateVehicleOffer = (req, res) => {
    try {
      const vehicleId = String(req.params.id || '').trim();
      const row = db
        .prepare('SELECT id, dealer_id, make, model, year, currency, allow_offers, listing_data, status, deleted_at FROM vehicles WHERE id = ?')
        .get(vehicleId);

      if (!row || row.deleted_at) {
        return res.status(404).json({ error: 'Vehicle listing not found.' });
      }
      let ld = {};
      try {
        ld = JSON.parse(row.listing_data || '{}');
      } catch {}
      if (!row.allow_offers && !ld.allowOffers) {
        return res.status(400).json({ error: 'This vehicle listing is not accepting offers.' });
      }

      const b = req.body || {};
      const rawAmount = b.amount !== undefined ? Number(b.amount) : b.amountMinor !== undefined ? Number(b.amountMinor) / 100 : NaN;
      const amountMinor = b.amountMinor !== undefined ? Math.round(Number(b.amountMinor)) : Math.round(rawAmount * 100);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        return res.status(400).json({ error: 'Enter a valid offer amount greater than zero.' });
      }

      const sessionUser = resolveSessionUser(req);
      const buyerId = sessionUser?.id || b.buyerId || null;
      const buyerProfile = buyerId ? db.prepare('SELECT display_name FROM buyer_profiles WHERE user_id = ?').get(buyerId) : null;
      const buyerName = String(b.buyerName || buyerProfile?.display_name || sessionUser?.email || 'Marketplace Buyer').trim().slice(0, 120);
      const buyerEmail = String(b.buyerEmail || sessionUser?.email || '').trim().slice(0, 160);
      const message = String(b.message || '').trim().slice(0, 1000);
      const offerId = randomUUID();
      const t = nowIso();
      const currency = ['GHS', 'USD'].includes(b.currency) ? b.currency : row.currency || 'GHS';

      db.prepare(
        `INSERT INTO vehicle_offers (
          id, vehicle_id, buyer_id, seller_id, buyer_name, buyer_email, amount_minor, currency, message, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      ).run(offerId, row.id, buyerId, row.dealer_id || null, buyerName, buyerEmail, amountMinor, currency, message, t, t);

      if (row.dealer_id) {
        addNotification(
          row.dealer_id,
          'offer',
          `New buyer offer of ${currency} ${(amountMinor / 100).toLocaleString()} received on ${row.year} ${row.make} ${row.model}.`
        );
      }

      return res.status(201).json({
        offer: {
          id: offerId,
          vehicle_id: row.id,
          amount: amountMinor / 100,
          amount_minor: amountMinor,
          currency,
          message,
          status: 'pending',
          created_at: t
        },
        notice: 'Your offer has been sent to the seller for review.'
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to submit offer.' });
    }
  };

  app.post('/api/vehicles/:id/offers', handleCreateVehicleOffer);
  app.post('/api/listings/:id/offers', handleCreateVehicleOffer);

  const handleBuyVehicle = (req, res) => {
    try {
      const sessionUser = resolveSessionUser(req);
      if (!sessionUser) {
        return res.status(401).json({ error: 'Please sign in with a buyer account to purchase a vehicle.' });
      }
      if (sessionUser.role !== 'buyer') {
        return res.status(403).json({ error: 'Sign in with a buyer account to purchase a vehicle.' });
      }

      const vehicleId = String(req.params.id || '').trim();
      const row = db
        .prepare('SELECT id, dealer_id, make, model, trim, year, price, price_minor, currency, city, listing_data, allow_deposit, deposit_amount_minor, status, is_demo, deleted_at FROM vehicles WHERE id = ?')
        .get(vehicleId);

      if (!row || row.deleted_at) {
        return res.status(404).json({ error: 'Vehicle listing not found.' });
      }
      if (row.status === 'sold') {
        return res.status(409).json({ error: 'This vehicle has already been sold.' });
      }

      const b = req.body || {};
      const buyerId = sessionUser.id;
      const askingMajor = row.price && Number(row.price) > 0 ? Number(row.price) : Math.round((Number(row.price_minor) || 0) / 100);
      let ld = {};
      try { ld = JSON.parse(row.listing_data || '{}'); } catch {}
      const allowDeposit = row.allow_deposit !== undefined && row.allow_deposit !== null ? Boolean(row.allow_deposit) : ld.allowDeposit !== undefined ? Boolean(ld.allowDeposit) : true;
      const paymentPlan = b.paymentPlan === 'deposit' ? 'deposit' : 'full';
      if (paymentPlan === 'deposit' && !allowDeposit) {
        return res.status(400).json({ error: 'Reservation deposits are not enabled by the seller for this vehicle. Please select full payment.' });
      }
      const configuredDepositMajor = row.deposit_amount_minor ? Math.round(Number(row.deposit_amount_minor)) / 100 : Number(ld.depositAmount || 0);
      const sellerDepositMajor = configuredDepositMajor > 0 && configuredDepositMajor < askingMajor ? configuredDepositMajor : Math.max(1, Math.round(askingMajor * 0.10));
      const payableMajor = paymentPlan === 'deposit' ? sellerDepositMajor : askingMajor;
      const balanceMajor = Math.max(0, askingMajor - payableMajor);
      const payableMinor = Math.round(payableMajor * 100);
      const currency = ['GHS', 'USD'].includes(b.currency) ? b.currency : row.currency || 'GHS';
      const channel = ['mobile_money', 'card', 'bank_transfer'].includes(b.channel) ? b.channel : 'mobile_money';
      const provider = String(b.provider || (channel === 'mobile_money' ? 'MTN MoMo' : channel === 'card' ? 'Visa / Mastercard' : 'Bank Transfer / USSD')).trim().slice(0, 80);
      const deliveryMethod = String(b.deliveryMethod || b.deliveryOption || 'Auto Connect Showroom Handover (Accra)').trim().slice(0, 120);
      const deliveryCity = String(b.deliveryCity || row.city || 'Accra').trim().slice(0, 80);
      const notes = String(b.notes || '').trim().slice(0, 1000);
      const buyerProfile = db.prepare('SELECT display_name FROM buyer_profiles WHERE user_id = ?').get(buyerId);
      const buyerName = String(b.buyerName || buyerProfile?.display_name || sessionUser.email || 'Verified Buyer').trim().slice(0, 120);

      const orderId = randomUUID();
      const orderRef = `ORD-GH-${String(Date.now()).slice(-6)}`;
      const paystackRef = `ps_buy_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const t = nowIso();
      const fallbackSeller = db.prepare("SELECT id FROM users WHERE role = 'dealer' ORDER BY created_at ASC LIMIT 1").get();
      const sellerId = row.dealer_id || fallbackSeller?.id || buyerId;
      const vehicleTitle = `${row.year} ${row.make} ${row.model}${row.trim ? ` ${row.trim}` : ''}`;

      if (sellerId) {
        db.prepare(
          `INSERT INTO seller_operations (id, seller_id, kind, name, status, payload_json, created_at, updated_at, archived_at)
           VALUES (?, ?, 'orders', ?, 'pending', ?, ?, ?, NULL)`
        ).run(
          orderId,
          sellerId,
          `${orderRef} · ${vehicleTitle}`,
          JSON.stringify({
            buyerId,
            reference: orderRef,
            paystackReference: paystackRef,
            listingId: row.id,
            customerName: `Verified Buyer (${buyerName.split(' ')[0] || 'Buyer'})`,
            deliveryCity,
            deliveryMethod,
            amount: payableMajor,
            totalVehiclePrice: askingMajor,
            balanceDue: balanceMajor,
            paymentPlan,
            paymentChannel: channel,
            paymentProvider: provider,
            currency,
            carrier: 'Auto Connect Escrow Logistics',
            tracking: `AC-TRK-${String(Date.now()).slice(-5)}`,
            items: `${vehicleTitle} (${paymentPlan === 'deposit' ? 'Seller Reservation Deposit' : 'Full Vehicle Purchase'})`,
            notes
          }),
          t,
          t
        );
      }

      db.prepare(
        `INSERT INTO payments (id, user_id, provider, external_payment_id, amount_minor, currency, status, created_at)
         VALUES (?, ?, 'paystack', ?, ?, ?, 'paid', ?)`
      ).run(randomUUID(), buyerId, paystackRef, payableMinor, currency, t);

      addNotification(
        buyerId,
        'order',
        `Order ${orderRef} confirmed for ${vehicleTitle} (${currency} ${payableMajor.toLocaleString()} paid via Paystack · Held in Auto Connect Escrow).`
      );
      if (row.dealer_id) {
        addNotification(
          row.dealer_id,
          'order',
          `New Auto Connect Escrow order (${orderRef}) received for ${vehicleTitle} (${currency} ${payableMajor.toLocaleString()}).`
        );
      }
      recordAuditLog(buyerId, 'buyer.vehicle.purchase', 'vehicle', row.id, {
        orderId,
        orderRef,
        paystackRef,
        paymentPlan,
        amount: payableMajor,
        currency,
        channel,
        provider
      });

      return res.status(201).json({
        order: {
          id: orderId,
          reference: orderRef,
          paystackReference: paystackRef,
          vehicleId: row.id,
          vehicleTitle,
          paymentPlan,
          amount: payableMajor,
          amountPaid: payableMajor,
          balanceDue: balanceMajor,
          amountMinor: payableMinor,
          totalVehiclePrice: askingMajor,
          currency,
          channel,
          provider,
          deliveryMethod,
          deliveryOption: deliveryMethod,
          deliveryCity,
          status: 'paid_escrow',
          created_at: t
        },
        notice: `Payment approved via Paystack (${orderRef}). Funds are held safely in Auto Connect Escrow while our team coordinates inspection and handover.`
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to complete vehicle purchase.' });
    }
  };

  app.post('/api/vehicles/:id/buy', handleBuyVehicle);
  app.post('/api/listings/:id/buy', handleBuyVehicle);

  // ============================================================================
  // 2. SUPPLIER / DEALER PANEL BACKEND (/api/supplier/*)
  // ============================================================================
  app.get('/api/supplier/dashboard', (req, res) => {
    try {
      const supplierId = resolveSupplierId(req);
      if (!supplierId) {
        return res.status(404).json({ error: 'No supplier account found in SQLite database.' });
      }

      const user = db.prepare('SELECT id, email, role, status, email_verified, created_at FROM users WHERE id = ?').get(supplierId);
      const profile = db.prepare('SELECT * FROM dealer_profiles WHERE user_id = ?').get(supplierId);
      const identity = db.prepare('SELECT * FROM seller_identity WHERE seller_id = ?').get(supplierId) || {
        seller_id: supplierId,
        provider: 'sqlite_sandbox',
        status: 'not_started',
        reason: '',
        livemode: 0
      };

      const vehicles = db
        .prepare('SELECT * FROM vehicles WHERE dealer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
        .all(supplierId)
        .map(r => formatVehicleRow(r, { includePrivateOfferRange: true }));

      const archivedVehicles = db
        .prepare('SELECT * FROM vehicles WHERE dealer_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC')
        .all(supplierId)
        .map(r => formatVehicleRow(r, { includePrivateOfferRange: true }));

      const drafts = db
        .prepare('SELECT id, payload_json, created_at, updated_at FROM seller_listing_drafts WHERE seller_id = ? ORDER BY updated_at DESC')
        .all(supplierId)
        .map(row => ({ id: row.id, ...JSON.parse(row.payload_json || '{}'), created_at: row.created_at, updated_at: row.updated_at }));

      const unpackOp = row => ({
        ...JSON.parse(row.payload_json || '{}'),
        id: row.id,
        name: row.name,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        archived_at: row.archived_at
      });

      const orders = db
        .prepare("SELECT * FROM seller_operations WHERE seller_id = ? AND kind = 'orders' AND archived_at IS NULL ORDER BY updated_at DESC")
        .all(supplierId)
        .map(unpackOp);

      const stock = db
        .prepare("SELECT * FROM seller_operations WHERE seller_id = ? AND kind = 'stock' AND archived_at IS NULL ORDER BY updated_at DESC")
        .all(supplierId)
        .map(unpackOp);

      const promotions = db
        .prepare("SELECT * FROM seller_operations WHERE seller_id = ? AND kind = 'promotions' AND archived_at IS NULL ORDER BY updated_at DESC")
        .all(supplierId)
        .map(unpackOp);

      const storeRecord = db
        .prepare("SELECT * FROM seller_operations WHERE seller_id = ? AND kind = 'store' AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 1")
        .get(supplierId);

      const enquiries = db
        .prepare(
          `SELECT e.id, e.vehicle_id, e.buyer_id, e.message, e.status, e.admin_status, e.forwarded_at, e.created_at,
                  v.make, v.model, v.year,
                  'Verified Marketplace Buyer' AS buyer_name
           FROM enquiries e
           JOIN vehicles v ON v.id = e.vehicle_id
           WHERE e.dealer_id = ? AND e.forwarded_to_seller = 1
           ORDER BY e.created_at DESC`
        )
        .all(supplierId);

      const offers = db
        .prepare(
          `SELECT o.*, v.make, v.model, v.year, v.price_minor, v.offer_min_minor, v.offer_max_minor
           FROM vehicle_offers o
           JOIN vehicles v ON v.id = o.vehicle_id
           WHERE v.dealer_id = ?
           ORDER BY o.created_at DESC`
        )
        .all(supplierId)
        .map(formatSupplierOfferRow);

      const viewsCount = db
        .prepare('SELECT count(*) AS n FROM vehicle_views WHERE vehicle_id IN (SELECT id FROM vehicles WHERE dealer_id = ?)')
        .get(supplierId).n;
      const savesCount = db
        .prepare('SELECT count(*) AS n FROM favourites WHERE vehicle_id IN (SELECT id FROM vehicles WHERE dealer_id = ?)')
        .get(supplierId).n;

      const metrics = {
        totalVehicles: vehicles.length,
        activeListings: vehicles.filter(v => v.status === 'active').length,
        pendingListings: vehicles.filter(v => v.status === 'pending').length,
        pausedListings: vehicles.filter(v => v.status === 'paused').length,
        soldListings: vehicles.filter(v => v.status === 'sold').length,
        drafts: drafts.length,
        views: viewsCount,
        saves: savesCount,
        enquiries: enquiries.length,
        unreadEnquiries: enquiries.filter(e => e.status === 'new').length,
        offers: offers.length,
        pendingOffers: offers.filter(o => o.status === 'pending').length,
        orders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        lowStock: stock.filter(s => Number(s.quantity) <= Number(s.threshold || 1)).length,
        promotions: promotions.length
      };

      return res.status(200).json({
        supplier: {
          id: supplierId,
          email: user?.email || '',
          status: user?.status || 'active',
          profile: profile || null,
          store: storeRecord ? unpackOp(storeRecord) : null,
          identity
        },
        metrics,
        vehicles,
        archivedVehicles,
        drafts,
        orders,
        stock,
        promotions,
        enquiries,
        offers
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to load supplier dashboard.' });
    }
  });

  app.get('/api/supplier/offers', (req, res) => {
    const supplierId = resolveSupplierId(req);
    if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
    const offers = db
      .prepare(
        `SELECT o.*, v.make, v.model, v.year, v.price_minor, v.offer_min_minor, v.offer_max_minor
         FROM vehicle_offers o
         JOIN vehicles v ON v.id = o.vehicle_id
         WHERE v.dealer_id = ?
         ORDER BY o.created_at DESC`
      )
      .all(supplierId)
      .map(formatSupplierOfferRow);
    return res.status(200).json({ offers, items: offers, total: offers.length });
  });

  app.patch('/api/supplier/offers/:id/status', (req, res) => {
    try {
      const supplierId = resolveSupplierId(req);
      if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
      const nextStatus = String(req.body?.status || '').trim();
      if (!['accepted', 'declined', 'pending'].includes(nextStatus)) {
        return res.status(400).json({ error: 'Offer status must be accepted, declined, or pending.' });
      }
      const offer = db
        .prepare(
          `SELECT o.*, v.dealer_id, v.make, v.model, v.year, v.price_minor, v.offer_min_minor, v.offer_max_minor
           FROM vehicle_offers o
           JOIN vehicles v ON v.id = o.vehicle_id
           WHERE o.id = ? AND v.dealer_id = ?`
        )
        .get(req.params.id, supplierId);
      if (!offer) return res.status(404).json({ error: 'Offer not found.' });

      const t = nowIso();
      db.prepare('UPDATE vehicle_offers SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, t, offer.id);
      if (offer.buyer_id) {
        addNotification(
          offer.buyer_id,
          'offer',
          `Your offer on ${offer.year} ${offer.make} ${offer.model} was ${nextStatus} by the seller.`
        );
      }
      const updated = db
        .prepare(
          `SELECT o.*, v.make, v.model, v.year, v.price_minor, v.offer_min_minor, v.offer_max_minor
           FROM vehicle_offers o
           JOIN vehicles v ON v.id = o.vehicle_id
           WHERE o.id = ?`
        )
        .get(offer.id);
      return res.status(200).json({ offer: formatSupplierOfferRow(updated) });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to update offer status.' });
    }
  });

  app.get('/api/supplier/profile', (req, res) => {
    const supplierId = resolveSupplierId(req);
    if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
    const profile = db.prepare('SELECT * FROM dealer_profiles WHERE user_id = ?').get(supplierId);
    return res.status(200).json({ profile: profile || null });
  });

  app.put('/api/supplier/profile', (req, res) => {
    try {
      const supplierId = resolveSupplierId(req);
      if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
      const b = req.body || {};
      const existing = db.prepare('SELECT * FROM dealer_profiles WHERE user_id = ?').get(supplierId);

      const businessName = String(b.business_name || b.businessName || existing?.business_name || '').trim();
      const city = String(b.city || existing?.city || 'Accra').trim();
      const region = String(b.region || existing?.region || 'Greater Accra').trim();
      const country = String(b.country || existing?.country || 'Ghana').trim();
      const contactEmail = String(b.contact_email || b.contactEmail || existing?.contact_email || '').trim();
      const phone = String(b.phone || existing?.phone || '').trim();
      const whatsapp = String(b.whatsapp || existing?.whatsapp || phone).trim();
      const description = String(b.description ?? existing?.description ?? '').trim();
      const openingHours = String(b.opening_hours || b.openingHours || existing?.opening_hours || 'Mon–Sat 08:30–18:00').trim();
      const website = String(b.website ?? existing?.website ?? '').trim();

      if (!businessName) {
        return res.status(400).json({ error: 'Business or supplier name is required.' });
      }

      db.prepare(
        `INSERT INTO dealer_profiles (
          user_id, seller_type, business_name, description, city, region, country,
          contact_email, phone, whatsapp, website, opening_hours, public_phone, public_whatsapp, status
        ) VALUES (?, 'dealer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, COALESCE(?, 'approved'))
        ON CONFLICT(user_id) DO UPDATE SET
          business_name = excluded.business_name,
          description = excluded.description,
          city = excluded.city,
          region = excluded.region,
          country = excluded.country,
          contact_email = excluded.contact_email,
          phone = excluded.phone,
          whatsapp = excluded.whatsapp,
          website = excluded.website,
          opening_hours = excluded.opening_hours`
      ).run(
        supplierId,
        businessName,
        description,
        city,
        region,
        country,
        contactEmail,
        phone,
        whatsapp,
        website,
        openingHours,
        existing?.status || 'approved'
      );

      recordAuditLog(supplierId, 'supplier.profile.update', 'dealer', supplierId, { businessName, city });
      const updated = db.prepare('SELECT * FROM dealer_profiles WHERE user_id = ?').get(supplierId);
      return res.status(200).json({ profile: updated });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to update supplier profile.' });
    }
  });

  app.get('/api/supplier/vehicles', (req, res) => {
    const supplierId = resolveSupplierId(req);
    if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
    const rows = db
      .prepare('SELECT * FROM vehicles WHERE dealer_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
      .all(supplierId)
      .map(r => formatVehicleRow(r, { includePrivateOfferRange: true }));
    return res.status(200).json({ vehicles: rows, items: rows, total: rows.length });
  });

  app.post('/api/supplier/vehicles', (req, res) => {
    try {
      const supplierId = resolveSupplierId(req);
      if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
      const b = req.body || {};
      const make = String(b.make || '').trim();
      const model = String(b.model || '').trim();
      const year = Number(b.year);
      const price = Number(b.price);
      const mileage = Number(b.mileage ?? 0);
      const city = String(b.city || 'Accra').trim();
      const country = String(b.country || 'Ghana').trim();
      const location = String(b.location || `${city}, ${country}`).trim();

      if (!make || !model || !Number.isInteger(year) || year < 1900 || year > 2100) {
        return res.status(400).json({ error: 'Make, model, and valid year are required.' });
      }
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({ error: 'Price must be greater than zero.' });
      }

      const { allowOffers, offerMinMinor, offerMaxMinor } = parseOfferConfig(b);
      const { allowDeposit, depositAmountMinor, depositAmountMajor } = parseDepositConfig(b, null, price);

      const vehicleId = randomUUID();
      const currency = ['GHS', 'USD'].includes(b.currency) ? b.currency : 'GHS';
      const priceMinor = Math.round(price * 100);
      const status = ['pending', 'active', 'paused', 'sold'].includes(b.status) ? b.status : 'pending';
      const t = nowIso();
      const listingDataObj = { ...(b.listingData && typeof b.listingData === 'object' ? b.listingData : {}) };
      delete listingDataObj.offerMinPrice;
      delete listingDataObj.offerMaxPrice;
      delete listingDataObj.offer_min_minor;
      delete listingDataObj.offer_max_minor;
      listingDataObj.allowOffers = Boolean(allowOffers);
      listingDataObj.allowDeposit = Boolean(allowDeposit);
      listingDataObj.depositAmount = depositAmountMajor;

      db.prepare(
        `INSERT INTO vehicles (
          id, dealer_id, make, model, trim, year, price, price_minor, currency, location, mileage,
          fuel, transmission, engine, drivetrain, body_type, exterior, interior, doors, seats,
          condition, city, country, description, listing_data, allow_offers, offer_min_minor, offer_max_minor,
          allow_deposit, deposit_amount_minor,
          status, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(
        vehicleId,
        supplierId,
        make,
        model,
        String(b.trim || ''),
        year,
        price,
        priceMinor,
        currency,
        location,
        Math.round(mileage),
        String(b.fuel || 'Petrol'),
        String(b.transmission || 'Automatic'),
        String(b.engine || ''),
        String(b.drivetrain || 'AWD'),
        String(b.body_type || b.bodyType || 'SUV'),
        String(b.exterior || 'Black'),
        String(b.interior || 'Black'),
        Number(b.doors || 4),
        Number(b.seats || 5),
        String(b.condition || 'Used'),
        city,
        country,
        String(b.description || `${year} ${make} ${model} listed by verified supplier in ${location}.`),
        JSON.stringify(listingDataObj),
        allowOffers,
        offerMinMinor,
        offerMaxMinor,
        allowDeposit,
        depositAmountMinor,
        status,
        t,
        t
      );

      const rawSupplierImages = Array.isArray(b.images) && b.images.length
        ? b.images
        : Array.isArray(b.imageUrls) && b.imageUrls.length
          ? b.imageUrls
          : [
              b.imageUrl ||
                b.image_url ||
                'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=82'
            ];
      const insertSupplierImgStmt = db.prepare(
        'INSERT INTO vehicle_images (id, vehicle_id, image_url, alt_text, sort_order) VALUES (?, ?, ?, ?, ?)'
      );
      rawSupplierImages.slice(0, 8).forEach((entry, idx) => {
        const urlStr = typeof entry === 'string' ? entry : entry?.url || entry?.image_url || '';
        const altStr = (typeof entry === 'object' && (entry?.alt || entry?.alt_text)) || `${year} ${make} ${model} — Photo ${idx + 1}`;
        if (urlStr) {
          insertSupplierImgStmt.run(randomUUID(), vehicleId, String(urlStr), String(altStr), idx);
        }
      });

      if (b.payListingFee !== false) {
        const reference = `sqlite_fee_${randomUUID().replaceAll('-', '')}`;
        db.prepare(
          `INSERT INTO listing_fee_payments (
            reference, seller_id, vehicle_id, amount_minor, currency, status, livemode, created_at, paid_at
          ) VALUES (?, ?, ?, 20000, 'GHS', 'paid', 0, ?, ?)`
        ).run(reference, supplierId, vehicleId, t, t);
      }

      recordAuditLog(supplierId, 'supplier.vehicle.create', 'vehicle', vehicleId, { make, model, year, status, allowOffers: Boolean(allowOffers), allowDeposit: Boolean(allowDeposit), depositAmount: depositAmountMajor });
      const created = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
      return res.status(201).json({ vehicle: formatVehicleRow(created, { includePrivateOfferRange: true }) });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Failed to create supplier vehicle.' });
    }
  });

  app.put('/api/supplier/vehicles/:id', (req, res) => {
    try {
      const supplierId = resolveSupplierId(req);
      const current = db
        .prepare('SELECT * FROM vehicles WHERE id = ? AND dealer_id = ? AND deleted_at IS NULL')
        .get(req.params.id, supplierId);
      if (!current) return res.status(404).json({ error: 'Supplier vehicle not found.' });

      const b = req.body || {};
      const make = String(b.make ?? current.make).trim();
      const model = String(b.model ?? current.model).trim();
      const trim = String(b.trim ?? current.trim).trim();
      const year = Number(b.year ?? current.year);
      const price = Number(b.price ?? (current.price > 0 ? current.price : current.price_minor / 100));
      const priceMinor = Math.round(price * 100);
      const mileage = Number(b.mileage ?? current.mileage);
      const city = String(b.city ?? current.city).trim();
      const country = String(b.country ?? current.country).trim();
      const location = String(b.location ?? `${city}, ${country}`).trim();
      const description = String(b.description ?? current.description).trim();

      const { allowOffers, offerMinMinor, offerMaxMinor } = parseOfferConfig(b, current);
      const { allowDeposit, depositAmountMinor } = parseDepositConfig(b, current, price);

      db.prepare(
        `UPDATE vehicles
         SET make = ?, model = ?, trim = ?, year = ?, price = ?, price_minor = ?,
             mileage = ?, city = ?, country = ?, location = ?, description = ?,
             allow_offers = ?, offer_min_minor = ?, offer_max_minor = ?,
             allow_deposit = ?, deposit_amount_minor = ?, updated_at = ?
         WHERE id = ? AND dealer_id = ?`
      ).run(
        make,
        model,
        trim,
        year,
        price,
        priceMinor,
        Math.round(mileage),
        city,
        country,
        location,
        description,
        allowOffers,
        offerMinMinor,
        offerMaxMinor,
        allowDeposit,
        depositAmountMinor,
        nowIso(),
        current.id,
        supplierId
      );

      const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(current.id);
      return res.status(200).json({ vehicle: formatVehicleRow(updated, { includePrivateOfferRange: true }) });
    } catch (error) {
      return res.status(error.status || 500).json({ error: error.message || 'Failed to update supplier vehicle.' });
    }
  });

  app.patch('/api/supplier/vehicles/:id/status', (req, res) => {
    try {
      const supplierId = resolveSupplierId(req);
      const current = db
        .prepare('SELECT * FROM vehicles WHERE id = ? AND dealer_id = ? AND deleted_at IS NULL')
        .get(req.params.id, supplierId);
      if (!current) return res.status(404).json({ error: 'Supplier vehicle not found.' });

      const nextStatus = String(req.body?.status || '').trim();
      if (!['active', 'paused', 'sold', 'pending'].includes(nextStatus)) {
        return res.status(400).json({ error: 'Status must be active, paused, sold, or pending.' });
      }

      db.prepare('UPDATE vehicles SET status = ?, updated_at = ? WHERE id = ? AND dealer_id = ?').run(
        nextStatus,
        nowIso(),
        current.id,
        supplierId
      );
      recordAuditLog(supplierId, `supplier.vehicle.status.${nextStatus}`, 'vehicle', current.id, { status: nextStatus });
      const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(current.id);
      return res.status(200).json({ id: current.id, status: nextStatus, vehicle: formatVehicleRow(updated) });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to update vehicle status.' });
    }
  });

  app.delete('/api/supplier/vehicles/:id', (req, res) => {
    const supplierId = resolveSupplierId(req);
    const current = db
      .prepare('SELECT id FROM vehicles WHERE id = ? AND dealer_id = ? AND deleted_at IS NULL')
      .get(req.params.id, supplierId);
    if (!current) return res.status(404).json({ error: 'Supplier vehicle not found.' });
    const t = nowIso();
    db.prepare('UPDATE vehicles SET deleted_at = ?, updated_at = ? WHERE id = ? AND dealer_id = ?').run(t, t, current.id, supplierId);
    recordAuditLog(supplierId, 'supplier.vehicle.archive', 'vehicle', current.id);
    return res.status(200).json({ deleted: true, id: current.id });
  });

  // Supplier Orders API
  app.get('/api/supplier/orders', (req, res) => {
    const supplierId = resolveSupplierId(req);
    if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
    const items = db
      .prepare("SELECT * FROM seller_operations WHERE seller_id = ? AND kind = 'orders' AND archived_at IS NULL ORDER BY updated_at DESC")
      .all(supplierId)
      .map(r => ({ ...JSON.parse(r.payload_json || '{}'), id: r.id, name: r.name, status: r.status, created_at: r.created_at, updated_at: r.updated_at }));
    return res.status(200).json({ orders: items, items, total: items.length });
  });

  app.post('/api/supplier/orders', (req, res) => {
    try {
      const supplierId = resolveSupplierId(req);
      if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
      const b = req.body || {};
      const orderId = randomUUID();
      const reference = String(b.reference || `ORD-GH-${Math.floor(100000 + Math.random() * 900000)}`).trim();
      const customerName = String(b.customerName || 'Kwame Mensah').trim();
      const amount = Number(b.amount || 0);
      const currency = ['GHS', 'USD'].includes(b.currency) ? b.currency : 'GHS';
      const payload = {
        reference,
        listingId: String(b.listingId || ''),
        customerName,
        deliveryCity: String(b.deliveryCity || 'Accra'),
        amount,
        currency,
        deliveryMethod: String(b.deliveryMethod || 'Showroom Handover'),
        tracking: String(b.tracking || ''),
        carrier: String(b.carrier || 'AutoConnect Logistics'),
        items: String(b.items || '1 vehicle'),
        notes: String(b.notes || '')
      };
      const name = String(b.name || `${reference} - ${customerName}`);
      const status = String(b.status || 'pending');
      const t = nowIso();

      db.prepare('INSERT INTO seller_operations VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)').run(
        orderId,
        supplierId,
        'orders',
        name,
        status,
        JSON.stringify(payload),
        t,
        t
      );
      recordAuditLog(supplierId, 'supplier.order.create', 'orders', orderId, { reference, amount, currency });
      return res.status(201).json({ order: { id: orderId, name, status, ...payload, created_at: t, updated_at: t } });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to create supplier order.' });
    }
  });

  app.patch('/api/supplier/orders/:id/status', (req, res) => {
    const supplierId = resolveSupplierId(req);
    const current = db
      .prepare("SELECT * FROM seller_operations WHERE id = ? AND seller_id = ? AND kind = 'orders'")
      .get(req.params.id, supplierId);
    if (!current) return res.status(404).json({ error: 'Supplier order not found.' });
    const nextStatus = String(req.body?.status || '').trim();
    if (!['pending', 'accepted', 'packing', 'shipped', 'ready_pickup', 'delivered', 'canceled', 'declined'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Invalid order status.' });
    }
    const t = nowIso();
    db.prepare('INSERT INTO seller_operation_history VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(),
      current.id,
      supplierId,
      current.payload_json,
      t
    );
    db.prepare('UPDATE seller_operations SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, t, current.id);
    recordAuditLog(supplierId, `supplier.order.${nextStatus}`, 'orders', current.id);
    return res.status(200).json({ id: current.id, status: nextStatus });
  });

  // Supplier Stock API
  app.get('/api/supplier/stock', (req, res) => {
    const supplierId = resolveSupplierId(req);
    if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
    const items = db
      .prepare("SELECT * FROM seller_operations WHERE seller_id = ? AND kind = 'stock' AND archived_at IS NULL ORDER BY updated_at DESC")
      .all(supplierId)
      .map(r => ({ ...JSON.parse(r.payload_json || '{}'), id: r.id, name: r.name, status: r.status, created_at: r.created_at, updated_at: r.updated_at }));
    return res.status(200).json({ stock: items, items, total: items.length });
  });

  app.post('/api/supplier/stock', (req, res) => {
    const supplierId = resolveSupplierId(req);
    if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
    const b = req.body || {};
    const stockId = randomUUID();
    const quantity = Math.max(0, Math.round(Number(b.quantity ?? 1)));
    const threshold = Math.max(0, Math.round(Number(b.threshold ?? 1)));
    const payload = {
      listingId: String(b.listingId || ''),
      sku: String(b.sku || `SKU-GH-${Math.floor(1000 + Math.random() * 9000)}`),
      quantity,
      threshold,
      variants: String(b.variants || 'Standard Showroom Trim'),
      description: String(b.description || '')
    };
    const name = String(b.name || payload.sku);
    const status = quantity <= threshold ? 'low_stock' : 'in_stock';
    const t = nowIso();
    db.prepare('INSERT INTO seller_operations VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)').run(
      stockId,
      supplierId,
      'stock',
      name,
      status,
      JSON.stringify(payload),
      t,
      t
    );
    return res.status(201).json({ item: { id: stockId, name, status, ...payload, created_at: t, updated_at: t } });
  });

  // Supplier Enquiries & Replies API (only Admin-forwarded enquiries are visible to suppliers)
  app.get('/api/supplier/enquiries', (req, res) => {
    const supplierId = resolveSupplierId(req);
    if (!supplierId) return res.status(404).json({ error: 'Supplier not found.' });
    const items = db
      .prepare(
        `SELECT e.id, e.vehicle_id, e.buyer_id, e.message, e.status, e.admin_status, e.forwarded_at, e.created_at,
                v.make, v.model, v.year,
                'Verified Marketplace Buyer' AS buyer_name
         FROM enquiries e
         JOIN vehicles v ON v.id = e.vehicle_id
         WHERE e.dealer_id = ? AND e.forwarded_to_seller = 1
         ORDER BY e.created_at DESC`
      )
      .all(supplierId);
    return res.status(200).json({ enquiries: items, items, total: items.length });
  });

  app.post('/api/supplier/enquiries/:id/reply', (req, res) => {
    const supplierId = resolveSupplierId(req);
    const enquiry = db.prepare('SELECT * FROM enquiries WHERE id = ? AND dealer_id = ? AND forwarded_to_seller = 1').get(req.params.id, supplierId);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found.' });
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Reply message is required.' });
    const msgId = randomUUID();
    const t = nowIso();
    db.prepare('INSERT INTO enquiry_messages (id, enquiry_id, sender_id, message, created_at) VALUES (?, ?, ?, ?, ?)').run(
      msgId,
      enquiry.id,
      supplierId,
      message,
      t
    );
    db.prepare("UPDATE enquiries SET status = 'replied' WHERE id = ?").run(enquiry.id);
    addNotification(enquiry.buyer_id, 'enquiry_reply', 'A supplier replied to your vehicle enquiry.');
    return res.status(201).json({ id: msgId, enquiry_id: enquiry.id, status: 'replied', message, created_at: t });
  });

  // ============================================================================
  // 3. ADMIN PANEL BACKEND (/api/admin/summary, /api/admin/suppliers, etc.)
  // ============================================================================
  const buildAdminSummary = () => {
    const counts = {
      totalUsers: db.prepare("SELECT count(*) AS n FROM users WHERE status != 'deleted'").get().n,
      buyers: db.prepare("SELECT count(*) AS n FROM users WHERE role = 'buyer' AND status != 'deleted'").get().n,
      dealers: db.prepare('SELECT count(*) AS n FROM dealer_profiles').get().n,
      suppliers: db.prepare('SELECT count(*) AS n FROM dealer_profiles').get().n,
      pendingDealers: db.prepare("SELECT count(*) AS n FROM dealer_profiles WHERE status = 'pending'").get().n,
      approvedDealerProfiles: db.prepare("SELECT count(*) AS n FROM dealer_profiles WHERE status = 'approved'").get().n,
      totalVehicles: db.prepare('SELECT count(*) AS n FROM vehicles WHERE deleted_at IS NULL').get().n,
      activeVehicles: db.prepare("SELECT count(*) AS n FROM vehicles WHERE status = 'active' AND deleted_at IS NULL").get().n,
      pendingVehicles: db.prepare("SELECT count(*) AS n FROM vehicles WHERE status = 'pending' AND deleted_at IS NULL").get().n,
      rejectedVehicles: db.prepare("SELECT count(*) AS n FROM vehicles WHERE status = 'rejected' AND deleted_at IS NULL").get().n,
      openReports: db.prepare("SELECT count(*) AS n FROM reports WHERE status IN ('open', 'reviewing')").get().n,
      pendingEnquiries: db.prepare("SELECT count(*) AS n FROM enquiries WHERE admin_status = 'pending_admin'").get().n,
      paidListingFees: db.prepare("SELECT count(*) AS n FROM listing_fee_payments WHERE status = 'paid'").get().n
    };

    const revenue = db
      .prepare(
        "SELECT currency, coalesce(sum(amount_minor), 0) AS amount_minor, count(*) AS payments FROM listing_fee_payments WHERE status = 'paid' GROUP BY currency"
      )
      .all()
      .map(r => ({ ...r, amount: r.amount_minor / 100 }));

    const pendingVehicles = db
      .prepare(
        `SELECT v.id, v.dealer_id, v.make, v.model, v.year, v.price, v.price_minor, v.currency, v.city, v.country, v.created_at,
                dp.business_name AS supplier_name,
                EXISTS(SELECT 1 FROM listing_fee_payments p WHERE p.vehicle_id = v.id AND p.status = 'paid') AS fee_paid
         FROM vehicles v
         LEFT JOIN dealer_profiles dp ON dp.user_id = v.dealer_id
         WHERE v.status = 'pending' AND v.deleted_at IS NULL
         ORDER BY v.created_at ASC`
      )
      .all()
      .map(r => ({ ...r, fee_paid: Boolean(r.fee_paid) }));

    const pendingDealers = db
      .prepare(
        `SELECT dp.user_id AS id, dp.business_name, dp.seller_type, dp.city, dp.region, dp.country, dp.contact_email, dp.phone, dp.status, dp.created_at
         FROM dealer_profiles dp
         WHERE dp.status = 'pending'
         ORDER BY dp.created_at ASC`
      )
      .all();

    const suppliers = db
      .prepare(
        `SELECT dp.user_id AS id, dp.business_name, dp.seller_type, dp.city, dp.region, dp.country, dp.contact_email, dp.phone, dp.status, dp.created_at,
                u.email, u.status AS user_status,
                coalesce(si.status, 'not_started') AS identity_status,
                (SELECT count(*) FROM vehicles v WHERE v.dealer_id = dp.user_id AND v.deleted_at IS NULL) AS vehicle_count
         FROM dealer_profiles dp
         JOIN users u ON u.id = dp.user_id
         LEFT JOIN seller_identity si ON si.seller_id = dp.user_id
         ORDER BY dp.created_at DESC`
      )
      .all();

    const reports = db
      .prepare(
        `SELECT r.id, r.vehicle_id, r.seller_id, r.reason, r.details, r.status, r.created_at,
                dp.business_name AS seller_name,
                v.make, v.model, v.year
         FROM reports r
         LEFT JOIN dealer_profiles dp ON dp.user_id = r.seller_id
         LEFT JOIN vehicles v ON v.id = r.vehicle_id
         WHERE r.status IN ('open', 'reviewing')
         ORDER BY r.created_at DESC`
      )
      .all();

    const enquiries = db
      .prepare(
        `SELECT e.*, v.make, v.model, v.year,
                u.email AS buyer_email, COALESCE(bp.display_name, u.email) AS buyer_name,
                dp.business_name AS seller_name
         FROM enquiries e
         JOIN vehicles v ON v.id = e.vehicle_id
         LEFT JOIN users u ON u.id = e.buyer_id
         LEFT JOIN buyer_profiles bp ON bp.user_id = e.buyer_id
         LEFT JOIN dealer_profiles dp ON dp.user_id = e.dealer_id
         ORDER BY e.created_at DESC`
      )
      .all()
      .map(e => ({
        ...e,
        original_message: e.original_message || e.message,
        forwardedToSeller: Boolean(e.forwarded_to_seller)
      }));

    const users = db
      .prepare(
        "SELECT id, email, role, status, email_verified, created_at FROM users WHERE status != 'deleted' ORDER BY created_at DESC LIMIT 100"
      )
      .all();

    const auditLogs = db
      .prepare(
        `SELECT a.id, a.actor_id, u.email AS actor_email, a.action, a.subject_type, a.subject_id, a.details_json, a.created_at
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         ORDER BY a.created_at DESC
         LIMIT 50`
      )
      .all()
      .map(r => ({ ...r, details: JSON.parse(r.details_json || '{}') }));

    const operations = {};
    for (const kind of ['organizations', 'teams', 'roles', 'tickets', 'content', 'flags', 'settings', 'integrations', 'backups']) {
      operations[kind] = db
        .prepare('SELECT * FROM operations_records WHERE kind = ? AND archived_at IS NULL ORDER BY updated_at DESC')
        .all(kind)
        .map(r => ({ ...JSON.parse(r.payload_json || '{}'), id: r.id, name: r.name, status: r.status, created_at: r.created_at, updated_at: r.updated_at }));
    }

    return {
      counts,
      revenue,
      pendingVehicles,
      pendingDealers,
      suppliers,
      reports,
      enquiries,
      users,
      auditLogs,
      operations
    };
  };

  app.get('/api/admin/summary', (req, res) => {
    try {
      return res.status(200).json(buildAdminSummary());
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to build admin summary.' });
    }
  });

  app.get('/api/admin/panel', (req, res) => {
    try {
      return res.status(200).json(buildAdminSummary());
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to build admin panel data.' });
    }
  });

  app.get('/api/admin/suppliers', (req, res) => {
    try {
      const summary = buildAdminSummary();
      return res.status(200).json({ suppliers: summary.suppliers, items: summary.suppliers, total: summary.suppliers.length });
    } catch {
      return res.status(500).json({ error: 'Failed to load suppliers.' });
    }
  });

  app.post('/api/admin/suppliers/:id/approve', (req, res) => {
    const admin = resolveAdminActor(req);
    const supplierId = req.params.id;
    const result = db.prepare("UPDATE dealer_profiles SET status = 'approved' WHERE user_id = ?").run(supplierId);
    if (!result.changes) return res.status(404).json({ error: 'Supplier profile not found.' });
    addNotification(supplierId, 'dealer_review', 'Your supplier profile has been approved for marketplace listings.');
    recordAuditLog(admin.id, 'dealer.approve', 'dealer', supplierId);
    return res.status(200).json({ id: supplierId, status: 'approved' });
  });

  app.post('/api/admin/suppliers/:id/reject', (req, res) => {
    const admin = resolveAdminActor(req);
    const supplierId = req.params.id;
    const result = db.prepare("UPDATE dealer_profiles SET status = 'rejected' WHERE user_id = ?").run(supplierId);
    if (!result.changes) return res.status(404).json({ error: 'Supplier profile not found.' });
    addNotification(supplierId, 'dealer_review', 'Your supplier profile requires updates before marketplace approval.');
    recordAuditLog(admin.id, 'dealer.reject', 'dealer', supplierId);
    return res.status(200).json({ id: supplierId, status: 'rejected' });
  });

  app.get('/api/admin/vehicles', (req, res) => {
    const rows = db
      .prepare(
        `SELECT v.*, dp.business_name AS supplier_name
         FROM vehicles v
         LEFT JOIN dealer_profiles dp ON dp.user_id = v.dealer_id
         WHERE v.deleted_at IS NULL
         ORDER BY v.created_at DESC`
      )
      .all()
      .map(formatVehicleRow);
    return res.status(200).json({ vehicles: rows, items: rows, total: rows.length });
  });

  app.post('/api/admin/vehicles/:id/approve', (req, res) => {
    const admin = resolveAdminActor(req);
    const vehicle = db
      .prepare('SELECT id, dealer_id, make, model, year, status FROM vehicles WHERE id = ? AND deleted_at IS NULL')
      .get(req.params.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found.' });

    const paid = db
      .prepare("SELECT reference FROM listing_fee_payments WHERE vehicle_id = ? AND status = 'paid' LIMIT 1")
      .get(vehicle.id);
    if (!paid) {
      return res.status(402).json({ error: 'This seller must pay the listing publishing fee before approval can publish it.' });
    }

    db.prepare("UPDATE vehicles SET status = 'active', updated_at = ? WHERE id = ?").run(nowIso(), vehicle.id);
    addNotification(vehicle.dealer_id, 'listing_review', `Your ${vehicle.year} ${vehicle.make} ${vehicle.model} listing is approved.`);
    recordAuditLog(admin.id, 'vehicle.approve', 'vehicle', vehicle.id);
    return res.status(200).json({ id: vehicle.id, status: 'active' });
  });

  app.post('/api/admin/vehicles/:id/reject', (req, res) => {
    const admin = resolveAdminActor(req);
    const vehicle = db
      .prepare('SELECT id, dealer_id, make, model, year FROM vehicles WHERE id = ? AND deleted_at IS NULL')
      .get(req.params.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found.' });

    db.prepare("UPDATE vehicles SET status = 'rejected', updated_at = ? WHERE id = ?").run(nowIso(), vehicle.id);
    addNotification(vehicle.dealer_id, 'listing_review', `Your ${vehicle.year} ${vehicle.make} ${vehicle.model} listing needs changes before approval.`);
    recordAuditLog(admin.id, 'vehicle.reject', 'vehicle', vehicle.id);
    return res.status(200).json({ id: vehicle.id, status: 'rejected' });
  });

  app.get('/api/admin/audit-logs', (req, res) => {
    const logs = db
      .prepare(
        `SELECT a.id, a.actor_id, u.email AS actor_email, a.action, a.subject_type, a.subject_id, a.details_json, a.created_at
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         ORDER BY a.created_at DESC
         LIMIT 100`
      )
      .all()
      .map(r => ({ ...r, details: JSON.parse(r.details_json || '{}') }));
    return res.status(200).json({ items: logs, total: logs.length });
  });

  app.get('/api/admin/enquiries', (req, res) => {
    const summary = buildAdminSummary();
    return res.status(200).json({ items: summary.enquiries, enquiries: summary.enquiries, total: summary.enquiries.length });
  });

  const handleAdminEnquiryModeration = (req, res, forcedAction = null) => {
    const admin = resolveAdminActor(req);
    const enquiry = db
      .prepare('SELECT e.*, v.year, v.make, v.model FROM enquiries e JOIN vehicles v ON v.id = e.vehicle_id WHERE e.id = ?')
      .get(req.params.id);
    if (!enquiry) return res.status(404).json({ error: 'Enquiry not found.' });

    const b = req.body || {};
    const nextMessage = b.message !== undefined ? String(b.message).trim().slice(0, 2000) : enquiry.message;
    if (nextMessage.length < 2) {
      return res.status(400).json({ error: 'Enquiry message must be at least 2 characters.' });
    }
    const adminNotes =
      b.adminNotes !== undefined
        ? String(b.adminNotes).trim().slice(0, 1000)
        : b.notes !== undefined
          ? String(b.notes).trim().slice(0, 1000)
          : enquiry.admin_notes || '';
    const action = forcedAction || (b.action === 'reject' || b.adminStatus === 'rejected' ? 'reject' : 'forward');

    if (action === 'reject') {
      db.prepare("UPDATE enquiries SET message = ?, admin_status = 'rejected', forwarded_to_seller = 0, admin_notes = ?, reviewed_by = ? WHERE id = ?").run(
        nextMessage,
        adminNotes,
        admin.id,
        enquiry.id
      );
      recordAuditLog(admin.id, 'enquiry.reject', 'enquiry', enquiry.id, { adminNotes });
      return res.status(200).json({
        id: enquiry.id,
        status: enquiry.status,
        adminStatus: 'rejected',
        forwardedToSeller: false,
        message: nextMessage,
        adminNotes
      });
    }

    const t = nowIso();
    db.prepare(
      "UPDATE enquiries SET message = ?, admin_status = 'forwarded', forwarded_to_seller = 1, admin_notes = ?, reviewed_by = ?, forwarded_at = ? WHERE id = ?"
    ).run(nextMessage, adminNotes, admin.id, t, enquiry.id);
    if (enquiry.dealer_id && !enquiry.forwarded_to_seller) {
      addNotification(enquiry.dealer_id, 'enquiry', `New enquiry for ${enquiry.year} ${enquiry.make} ${enquiry.model}.`);
    }
    recordAuditLog(admin.id, 'enquiry.forward', 'enquiry', enquiry.id, {
      edited: nextMessage !== (enquiry.original_message || enquiry.message),
      adminNotes
    });
    return res.status(200).json({
      id: enquiry.id,
      status: enquiry.status,
      adminStatus: 'forwarded',
      forwardedToSeller: true,
      message: nextMessage,
      originalMessage: enquiry.original_message || enquiry.message,
      adminNotes,
      forwardedAt: t
    });
  };

  app.post('/api/admin/enquiries/:id/forward', (req, res) => handleAdminEnquiryModeration(req, res, 'forward'));
  app.post('/api/admin/enquiries/:id/reject', (req, res) => handleAdminEnquiryModeration(req, res, 'reject'));
  app.patch('/api/admin/enquiries/:id', (req, res) => handleAdminEnquiryModeration(req, res, null));

  // ============================================================================
  // 4. PAYSTACK CHECKOUT SIMULATOR (/api/paystack/simulate/*)
  // ============================================================================
  const computeListingFeeMinor = (priceMinor, currency = 'GHS') => {
    if (currency !== 'GHS' || !Number.isFinite(Number(priceMinor)) || Number(priceMinor) <= 0) return null;
    const p = Number(priceMinor);
    if (p <= 10000000) return 6000;
    if (p <= 50000000) return 8000;
    if (p <= 100000000) return 10000;
    return 20000;
  };

  app.post('/api/paystack/simulate/initialize', (req, res) => {
    try {
      const b = req.body || {};
      const listingId = String(b.listingId || b.vehicleId || '').trim();
      if (!listingId) return res.status(400).json({ error: 'listingId is required.' });

      const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ? AND deleted_at IS NULL').get(listingId);
      if (!vehicle) return res.status(404).json({ error: 'Vehicle listing not found.' });

      const sellerId = vehicle.dealer_id || resolveSupplierId(req);
      const seller = sellerId ? db.prepare('SELECT email FROM users WHERE id = ?').get(sellerId) : null;
      const priceMinor = vehicle.price_minor > 0 ? vehicle.price_minor : Math.round(Number(vehicle.price || 0) * 100);
      const amountMinor = computeListingFeeMinor(priceMinor, vehicle.currency || 'GHS');
      if (amountMinor === null) {
        return res.status(409).json({ error: 'Listing fees require a positive GHS asking price.' });
      }

      const alreadyPaid = db
        .prepare("SELECT reference FROM listing_fee_payments WHERE vehicle_id = ? AND status = 'paid' LIMIT 1")
        .get(vehicle.id);
      if (alreadyPaid) {
        return res.status(409).json({ error: 'This listing fee is already paid.', reference: alreadyPaid.reference });
      }

      db.prepare("UPDATE listing_fee_payments SET status = 'superseded' WHERE vehicle_id = ? AND status = 'pending'").run(vehicle.id);
      const reference = `pstk_sim_${randomUUID().replaceAll('-', '')}`;
      const checkoutUrl = `https://checkout.paystack.com/sim_${reference.slice(-12)}`;
      const accessCode = `sim_${reference.slice(-10)}`;
      const t = nowIso();

      db.prepare(
        `INSERT INTO listing_fee_payments (
          reference, seller_id, vehicle_id, amount_minor, currency, status, livemode, checkout_url, created_at
        ) VALUES (?, ?, ?, ?, 'GHS', 'pending', 0, ?, ?)`
      ).run(reference, sellerId, vehicle.id, amountMinor, checkoutUrl, t);

      recordAuditLog(sellerId, 'listing.fee.paystack_sim_init', 'vehicle', vehicle.id, {
        reference,
        amount: amountMinor,
        currency: 'GHS'
      });

      return res.status(200).json({
        status: true,
        message: 'Simulated Paystack authorization URL created',
        simulated: true,
        reference,
        accessCode,
        authorizationUrl: checkoutUrl,
        amountMinor,
        currency: 'GHS',
        email: String(b.email || seller?.email || 'dealer@autoconnect.gh'),
        listing: {
          id: vehicle.id,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model
        },
        data: {
          authorization_url: checkoutUrl,
          access_code: accessCode,
          reference
        }
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to initialize simulated Paystack checkout.' });
    }
  });

  app.post('/api/paystack/simulate/verify', (req, res) => {
    try {
      const b = req.body || {};
      const reference = String(b.reference || '').trim();
      if (!reference) return res.status(400).json({ error: 'Payment reference is required.' });

      const payment = db.prepare('SELECT * FROM listing_fee_payments WHERE reference = ?').get(reference);
      if (!payment) return res.status(404).json({ error: 'Paystack transaction reference not found.' });

      const outcome = String(b.outcome || 'success');
      const channel = String(b.channel || 'mobile_money');
      const network = String(b.network || 'MTN MoMo');
      const t = nowIso();

      if (outcome === 'declined') {
        db.prepare("UPDATE listing_fee_payments SET status = 'failed' WHERE reference = ?").run(reference);
        recordAuditLog(payment.seller_id, 'listing.fee.failed', 'vehicle', payment.vehicle_id, {
          reference,
          channel,
          outcome
        });
        return res.status(402).json({
          status: false,
          paid: false,
          reference,
          error: 'Simulated Paystack charge was declined by the provider.'
        });
      }

      if (outcome === 'abandoned') {
        return res.status(200).json({
          status: true,
          paid: false,
          reference,
          paymentStatus: 'pending'
        });
      }

      db.prepare("UPDATE listing_fee_payments SET status = 'paid', livemode = 0, paid_at = ? WHERE reference = ?").run(t, reference);
      recordAuditLog(payment.seller_id, 'listing.fee.paid', 'vehicle', payment.vehicle_id, {
        reference,
        amount: payment.amount_minor,
        currency: payment.currency,
        provider: 'paystack_simulator',
        channel,
        network
      });

      return res.status(200).json({
        status: true,
        paid: true,
        reference,
        channel,
        network,
        amountMinor: payment.amount_minor,
        currency: payment.currency,
        paidAt: t,
        receiptNumber: `PSTK-GH-${reference.slice(-8).toUpperCase()}`,
        data: {
          reference,
          status: 'success',
          amount: payment.amount_minor,
          currency: payment.currency,
          channel,
          domain: 'test',
          paid_at: t
        }
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to verify simulated Paystack payment.' });
    }
  });

  return { app, db };
}

// Start the Express server if this file is executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.EXPRESS_PORT || process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const { app } = createExpressApp();
  app.listen(port, host, () => {
    console.log(`Express SQLite server listening on ${host}:${port}`);
  });
}

export default createExpressApp;
