const base = process.env.AUTO_CONNECT_SUPABASE_URL;
const key = process.env.AUTO_CONNECT_SUPABASE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end('Method not allowed'); }
  try {
    const id = String(req.query.id || '').trim();
    if (!id || !base || !key) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Vehicle listing not found.' })); }
    const response = await fetch(base + '/rest/v1/public_vehicle_listings?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1', {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    const rows = await response.json();
    if (!response.ok) throw new Error(rows?.message || 'Supabase query failed');
    const v = rows[0];
    if (!v) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Vehicle listing not found.' })); }
    let data = {};
    try { data = typeof v.listing_data === 'string' ? JSON.parse(v.listing_data || '{}') : (v.listing_data || {}); } catch {}
    const price = Number(v.price_minor) > 0 ? Number(v.price_minor) / 100 : Number(v.price || 0);
    const allowOffers = Boolean(v.allow_offers || data.allowOffers);
    const allowDeposit = v.allow_deposit == null ? data.allowDeposit !== false : Boolean(v.allow_deposit);
    const deposit = Number(v.deposit_amount_minor || 0) / 100 || (allowDeposit ? Math.max(1, Math.round(price * .1)) : null);
    const { listing_data, dealer_id, dealer_name, seller_type, dealer_city, dealer_region, dealer_status, ...safe } = v;
    const vehicle = {
      ...safe, price, location: v.location || [v.city, v.country].filter(Boolean).join(', '),
      allow_offers: allowOffers ? 1 : 0, allowOffers, allow_deposit: allowDeposit ? 1 : 0, allowDeposit,
      deposit_amount_minor: allowDeposit && deposit ? Math.round(deposit * 100) : null,
      depositAmount: allowDeposit ? deposit : null, listingData: data,
      images: Array.isArray(v.images) ? v.images : [],
      dealer: dealer_name ? { name: dealer_name, type: seller_type || 'dealer', city: dealer_city || '', region: dealer_region || '', status: dealer_status, phone: '', whatsapp: '', website: '', profileId: dealer_id } : null,
      is_demo: Boolean(v.is_demo)
    };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ vehicle }));
  } catch (error) {
    console.error('Auto Connect listing detail:', error.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Could not load this vehicle listing.' }));
  }
}