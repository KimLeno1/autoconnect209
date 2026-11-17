import { proxyToSupabase } from '../../lib/supabase-proxy.js';
export const config = { api: { bodyParser: false } };
export default function handler(req, res) { return proxyToSupabase(req, res); }
