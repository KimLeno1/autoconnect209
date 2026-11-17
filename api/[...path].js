import { createHash } from 'node:crypto';

const base = (process.env.AUTO_CONNECT_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.AUTO_CONNECT_SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

async function query(table, params, options = {}) {
  if (!base || !key) throw new Error('Missing server-side Supabase configuration');
  const response = await fetch(base + '/rest/v1/' + table + (params ? '?' + params : ''), {
    method: options.method || 'GET',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation'
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(data?.message || 'Supabase request failed: ' + response.status);
  return data;
}

function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}
function cookie(req, name) {
  const item = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  try { return item ? decodeURIComponent(item.slice(name.length + 1)) : ''; } catch { return ''; }
}
function inList(values) {
  return 'in.(' + values.map(x => '"' + String(x).replaceAll('"', '\\"') + '"').join(',') + ')';
}
async function publicVehicles(filters = {}) {
  let rows = await query('public_vehicle_listings', 'select=*&order=created_at.desc&limit=500');
  rows = rows || [];
  const q = String(filters.q || '').trim().toLowerCase();
  if (q) rows = rows.filter(v => [v.make,v.model,v.trim,v.engine,v.body_type,v.city,v.country,v.dealer_name].some(x => String(x || '').toLowerCase().includes(q)));
  for (const field of ['make','fuel','transmission','condition','drivetrain']) {
    if (filters[field]) rows = rows.filter(v => String(v[field] || '').toLowerCase() === String(filters[field]).toLowerCase());
  }
  if (filters.location) rows = rows.filter(v => String(v.city || '').toLowerCase().includes(String(filters.location).toLowerCase()));
  if (filters.minPrice) rows = rows.filter(v => Number(v.price_minor) >= Number(filters.minPrice) * 100);
  if (filters.maxPrice) rows = rows.filter(v => Number(v.price_minor) <= Number(filters.maxPrice) * 100);
  if (filters.minYear) rows = rows.filter(v => Number(v.year) >= Number(filters.minYear));
  if (filters.maxYear) rows = rows.filter(v => Number(v.year) <= Number(filters.maxYear));
  if (filters.sort === 'priceAsc') rows.sort((a,b) => Number(a.price_minor)-Number(b.price_minor));
  if (filters.sort === 'priceDesc') rows.sort((a,b) => Number(b.price_minor)-Number(a.price_minor));
  return rows.map(v => {
    let data = {};
    try { data = typeof v.listing_data === 'string' ? JSON.parse(v.listing_data || '{}') : (v.listing_data || {}); } catch {}
    const price = Number(v.price_minor) > 0 ? Number(v.price_minor)/100 : Number(v.price || 0);
    const allowOffers = Boolean(v.allow_offers || data.allowOffers);
    const allowDeposit = v.allow_deposit == null ? data.allowDeposit !== false : Boolean(v.allow_deposit);
    const deposit = Number(v.deposit_amount_minor || 0)/100 || (allowDeposit ? Math.max(1, Math.round(price*.1)) : null);
    const { listing_data, dealer_id, dealer_name, seller_type, dealer_city, dealer_region, dealer_status, ...safe } = v;
    return {
      ...safe, price, location: v.location || [v.city,v.country].filter(Boolean).join(', '),
      allow_offers: allowOffers ? 1 : 0, allowOffers,
      allow_deposit: allowDeposit ? 1 : 0, allowDeposit,
      deposit_amount_minor: allowDeposit && deposit ? Math.round(deposit*100) : null,
      depositAmount: allowDeposit ? deposit : null, listingData: data,
      images: Array.isArray(v.images) ? v.images : [],
      dealer: dealer_name ? { name: dealer_name, type: seller_type || 'dealer', city: dealer_city || '', region: dealer_region || '', status: dealer_status, phone: '', whatsapp: '', website: '', profileId: dealer_id } : null,
      is_demo: Boolean(v.is_demo)
    };
  });
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://' + (req.headers.host || 'localhost'));
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    if (path === 'health' && req.method === 'GET') {
      const rows = await query('public_vehicle_listings', 'select=id&limit=1');
      return send(res, 200, { status: 'ok', service: 'auto-connect-api', database: 'connected', sampleRows: rows.length, checkedAt: new Date().toISOString() });
    }
    if (path === 'listings' && req.method === 'GET') {
      const all = await publicVehicles(Object.fromEntries(url.searchParams.entries()));
      const page = Math.max(1, Math.min(100, Number(url.searchParams.get('page')) || 1));
      const limit = 12;
      return send(res, 200, { items: all.slice((page-1)*limit, page*limit), page, limit, total: all.length, pages: Math.max(1, Math.ceil(all.length/limit)) });
    }
    const match = path.match(/^listings\/([^/]+)$/);
    if (match && req.method === 'GET') {
      const all = await publicVehicles({});
      const vehicle = all.find(x => x.id === decodeURIComponent(match[1]));
      return vehicle ? send(res, 200, { vehicle }) : send(res, 404, { error: 'Vehicle listing not found.' });
    }
    if (path === 'auth/me' && req.method === 'GET') {
      return send(res, 200, { user: null, csrfToken: null });
    }
    if (path === 'auth/login' || path === 'auth/register') {
      return send(res, 503, { error: 'Secure account sessions are being migrated. Please try again later.' });
    }
    if (path === 'makes' && req.method === 'GET') {
      const [makes, models] = await Promise.all([
        query('vehicle_makes', 'select=id,name&order=name.asc'),
        query('vehicle_models', 'select=id,make_id,name&order=name.asc')
      ]);
      return send(res, 200, { items: makes.map(m => ({ ...m, models: models.filter(x => x.make_id === m.id).map(x => x.name) })) });
    }
    if (path === 'customs-rules' && req.method === 'GET') {
      const rules = await query('customs_rules', 'select=country_code,rule_json,source_url,effective_at&order=country_code.asc');
      return send(res, 200, { items: rules.map(x => { let d = {}; try { d = typeof x.rule_json === 'string' ? JSON.parse(x.rule_json) : x.rule_json || {}; } catch {} return { countryCode: x.country_code, ...d, sourceUrl: x.source_url, effectiveAt: x.effective_at }; }) });
    }
    return send(res, 404, { error: 'API route not implemented in the Supabase deployment yet.' });
  } catch (error) {
    console.error('Auto Connect API:', error.message);
    return send(res, 500, { error: 'The request could not be completed. Check the Supabase connection and server configuration.' });
  }
}