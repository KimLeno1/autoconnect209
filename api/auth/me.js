import { proxyToSupabase } from '../../lib/supabase-proxy.js';
export default function handler(req, res) { return proxyToSupabase(req, res); }
