import { createHash } from 'node:crypto';

const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

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
  let rows = await query('vehicles', 'select=*&status=eq.active&deleted_at=is.null&order=created_at.desc&limit=500');
  rows = rows || [];
  const ids = [...new Set(rows.map(x => x.dealer_id).filter(Boolean))];
  const vehicleIds = rows.map(x => x.id);
  const [dealers, sellers, pictures] = await Promise.all([
    ids.length ? query('dealer_profiles', 'user_id=' + inList(ids) + '&select=user_id,seller_type,business_name,city,region,status') : [],
    ids.length ? query('users', 'id=' + inList(ids) + '&select=id,status') : [],
    vehicleIds.length ? query('vehicle_images', 'vehicle_id=' + inList(vehicleIds) + '&select=id,vehicle_id,image_url,alt_text,sort_order&order=sort_order.asc') : []
  ]);
  const dealerMap = new Map((dealers || []).map(x => [x.user_id, x]));
  const sellerMap = new Map((sellers || []).map(x => [x.id, x]));
  const imageMap = new Map();
  for (const image of pictures || []) {
    if (!imageMap.has(image.vehicle_id)) imageMap.set(image.vehicle_id, []);
    imageMap.get(image.vehicle_id).push({ id: image.id, url: image.image_url, alt: image.alt_text || '', sort_order: image.sort_order });
  }
  rows = rows.filter(v => Boolean(v.is_demo) || (dealerMap.get(v.dealer_id)?.status === 'approved' && sellerMap.get(v.dealer_id)?.status === 'active'));
  const q = String(filters.q || '').trim().toLowerCase();
  if (q) rows = rows.filter(v => [v.make,v.model,v.trim,v.engine,v.body_type,v.city,v.country].some(x => String(x || '').toLowerCase().includes(q)));
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
    for (const k of ['vin','registrationNumber','businessAddress','offerMinPrice','offerMaxPrice','offer_min_minor','offer_max_minor','phone','whatsapp','email','contactEmail']) delete data[k];
    const price = Number(v.price_minor) > 0 ? Number(v.price_minor)/100 : Number(v.price || 0);
    const allowOffers = Boolean(v.allow_offers || data.allowOffers);
    const allowDeposit = v.allow_deposit == null ? data.allowDeposit !== false : Boolean(v.allow_deposit);
    const dealer = dealerMap.get(v.dealer_id);
    const { dealer_id, listing_data, offer_min_minor, offer_max_minor, ...safe } = v;
    const deposit = Number(v.deposit_amount_minor || 0)/100 || (allowDeposit ? Math.max(1, Math.round(price*.1)) : null);
    return {
      ...safe, price, location: v.location || [v.city,v.country].filter(Boolean).join(', '),
      allow_offers: allowOffers ? 1 : 0, allowOffers,
      allow_deposit: allowDeposit ? 1 : 0, allowDeposit,
      deposit_amount_minor: allowDeposit && deposit ? Math.round(deposit*100) : null,
      depositAmount: allowDeposit ? deposit : null, listingData: data,
      images: imageMap.get(v.id) || [],
      dealer: dealer ? { name: dealer.business_name, type: dealer.seller_type || 'dealer', city: dealer.city || '', region: dealer.region || '', status: dealer.status, phone: '', whatsapp: '', website: '', profileId: v.dealer_id } : null,
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
      const rows = await query('vehicles', 'select=id&limit=1');
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
      const token = cookie(req, 'apex_session');
      if (!token) return send(res, 200, { user: null, csrfToken: null });
      const hash = createHash('sha256').update(token).digest('hex');
      const sessions = await query('sessions', 'id_hash=eq.' + encodeURIComponent(hash) + '&select=user_id,csrf_token,expires_at&limit=1');
      const session = sessions[0];
      if (!session || Date.parse(session.expires_at) < Date.now()) return send(res, 200, { user: null, csrfToken: null });
      const users = await query('users', 'id=eq.' + encodeURIComponent(session.user_id) + '&select=id,email,role,status,email_verified&limit=1');
      const user = users[0];
      return send(res, 200, { user: user?.status === 'active' ? { id: user.id, email: user.email, role: user.role, emailVerified: Boolean(user.email_verified) } : null, csrfToken: user?.status === 'active' ? session.csrf_token : null });
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