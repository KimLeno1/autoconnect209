import { proxyToSupabase } from '../_supabase-proxy.js';
export default function handler(req, res) { return proxyToSupabase(req, res); }
