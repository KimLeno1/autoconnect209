import { proxyToSupabase } from '../lib/supabase-proxy.js';

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  const route = Array.isArray(req.query?.route)
    ? req.query.route.join('/')
    : String(req.query?.route || '');
  if (!route || route.split('/').some(part => part === '..' || part === '.')) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'A valid API route is required.' }));
  }
  return proxyToSupabase(req, res, route);
}
