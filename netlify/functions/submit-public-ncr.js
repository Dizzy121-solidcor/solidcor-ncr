// ═══════════════════════════════════════════════════════════════
// submit-public-ncr.js — Netlify Function
// Server-side rate-limited handler for public NCR portal submissions.
// Inserts the NCR into Supabase using the service role (or anon) key
// after checking the source IP isn't being abused.
// ═══════════════════════════════════════════════════════════════

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xphdmmujmjommpdnthku.supabase.co';
// Prefer service role key (bypasses RLS) — fall back to anon key.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
                  || process.env.SUPABASE_KEY
                  || process.env.SKEY;

// In-memory rate-limit map. Persists across warm invocations on the
// same lambda container. Cold starts wipe it — that's fine for our
// threat model (occasional cold-start window doesn't enable real abuse).
//   key   = IP address string
//   value = [timestamps of recent submissions]
const RL_MAP = new Map();
const RL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RL_MAX      = 10;              // submissions per IP per hour

// Honeypot field name — must match the hidden input on the public form
const HONEYPOT_FIELD = 'website';

function getClientIp(event) {
  // Netlify forwards real IP in x-nf-client-connection-ip (most reliable)
  // and x-forwarded-for (may be a comma-separated chain).
  const h = event.headers || {};
  const ip = h['x-nf-client-connection-ip']
          || (h['x-forwarded-for'] || '').split(',')[0].trim()
          || h['client-ip']
          || 'unknown';
  return ip || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const arr = (RL_MAP.get(ip) || []).filter(t => now - t < RL_WINDOW_MS);
  if (arr.length >= RL_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((arr[0] + RL_WINDOW_MS - now) / 1000) };
  }
  arr.push(now);
  RL_MAP.set(ip, arr);
  // Light-touch cleanup — stops the map growing unbounded over many days
  if (RL_MAP.size > 10000) {
    for (const [k, v] of RL_MAP) {
      const fresh = v.filter(t => now - t < RL_WINDOW_MS);
      if (fresh.length === 0) RL_MAP.delete(k);
      else RL_MAP.set(k, fresh);
    }
  }
  return { allowed: true };
}

function postToSupabase(table, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/rest/v1/' + table);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true });
        else resolve({ ok: false, status: res.statusCode, body: data });
      });
    });
    req.on('error', e => reject(e));
    req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // Honeypot check — invisible field that real users don't see/touch.
  if (body[HONEYPOT_FIELD]) {
    // Pretend success so bots don't get a signal that they were blocked.
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: body?.ncr?.id || null }) };
  }

  const ncr = body.ncr;
  if (!ncr || !ncr.id || !ncr.customer || !ncr.issue) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required NCR fields' }) };
  }

  // Force the record into known-safe shape — don't let the client claim
  // they're an internal NCR, mark a different status, etc.
  ncr.type = 'external';
  ncr.status = 'open';
  ncr.source = ncr.source || 'external_portal';
  ncr.legacy = false;

  const ip = getClientIp(event);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return {
      statusCode: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec) },
      body: JSON.stringify({
        error: 'Too many submissions from your network in the last hour. Please call us directly if this is urgent.',
        retryAfterSec: rl.retryAfterSec
      })
    };
  }

  if (!SUPABASE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Supabase key not configured on server' }) };
  }

  try {
    const result = await postToSupabase('ncr_records', ncr);
    if (!result.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Database insert failed', detail: result.body }) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, id: ncr.id })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error: ' + (e.message || 'unknown') }) };
  }
};
