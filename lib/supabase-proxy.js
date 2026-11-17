export async function proxyToSupabase(req, res, routeOverride) {
  const base = String(process.env.AUTO_CONNECT_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.AUTO_CONNECT_SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "Secure API configuration is unavailable." }));
  }
  const parsed = new URL(req.url || "/api/", "http://localhost");
  const route = String(routeOverride || parsed.searchParams.get("route") || parsed.pathname.replace(/^\/api/, "")).replace(/^\/+/, "");
  const extra = new URLSearchParams(parsed.searchParams);
  extra.delete("route");
  const target = base + "/functions/v1/auto-connect-api/" + route.split("/").filter(Boolean).map(encodeURIComponent).join("/") + (extra.toString() ? "?" + extra.toString() : "");
  const headers = {
    apikey: key,
    "x-forwarded-host": req.headers.host || "",
  };
  for (const name of ["content-type", "cookie", "origin", "x-csrf-token", "x-forwarded-proto", "x-paystack-signature"]) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.body !== undefined) body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    else {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (chunks.length) body = Buffer.concat(chunks);
    }
  }
  try {
    const upstream = await fetch(target, { method: req.method, headers, body, redirect: "manual" });
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", upstream.headers.get("cache-control") || "no-store");
    const cookies = typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : (upstream.headers.get("set-cookie") ? [upstream.headers.get("set-cookie")] : []);
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    const text = await upstream.text();
    return res.end(text);
  } catch (error) {
    console.error("Auto Connect Supabase proxy:", error?.message || error);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ error: "The secure account service is temporarily unavailable." }));
  }
}
