// ═══════════════════════════════════════════════════════════════
// Solidcor Daily Stock Report — Netlify Scheduled Function
// Runs at 7:00 AM UTC every day
// ═══════════════════════════════════════════════════════════════

const https = require('https');

// ── Config from Netlify env vars ─────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL  || 'https://xphdmmujmjommpdnthku.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_KEY  || process.env.SKEY;
const EJS_SERVICE   = process.env.EJS_SERVICE_ID;
const EJS_TEMPLATE  = process.env.EJS_TEMPLATE_ID;
const EJS_PUBKEY    = process.env.EJS_PUBLIC_KEY;
const STOCK_EMAIL   = process.env.STOCK_REPORT_EMAIL;
const NOTIFY_EMAIL  = process.env.NCR_NOTIFY_EMAIL; // optional — same alert email

// ── Helper: fetch from Supabase ───────────────────────────────────
function sbFetch(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Helper: send via EmailJS REST API ────────────────────────────
function sendEmail(toEmail, subject, htmlBody) {
  return new Promise((resolve) => {
    if (!EJS_SERVICE || !EJS_TEMPLATE || !EJS_PUBKEY) {
      console.log('EmailJS not configured — skipping email to', toEmail);
      resolve(false);
      return;
    }

    const payload = JSON.stringify({
      service_id: EJS_SERVICE,
      template_id: EJS_TEMPLATE,
      user_id: EJS_PUBKEY,
      template_params: {
        to_email: toEmail,
        subject: subject,
        html_body: htmlBody,
        reply_to: 'noreply@solidcor.co.uk'
      }
    });

    const req = https.request({
      hostname: 'api.emailjs.com',
      path: '/api/v1.0/email/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'origin': 'https://delightful-beijinho-67f487.netlify.app'
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log(`Email to ${toEmail}: ${res.statusCode} ${data.slice(0,100)}`);
        resolve(res.statusCode === 200);
      });
    });
    req.on('error', (e) => { console.error('Email error:', e.message); resolve(false); });
    req.write(payload);
    req.end();
  });
}

// ── Build the stock report HTML ───────────────────────────────────
function buildStockReportHtml(ydNcrs, scrapNcrs, costNcrs, ydLabel) {
  const totalScrapCost = scrapNcrs.reduce((s, r) => s + (r.cost || 0), 0);
  const totalCost = ydNcrs.reduce((s, r) => s + (r.cost || 0), 0);

  const thead = `<tr style="background:#f3f4f6">
    ${['NCR ID','Customer','Door ref','Sales Order','Issue','Action','Cost'].map(h =>
      `<th style="padding:7px 10px;text-align:${h==='Cost'||h==='Action'?'right':'left'};font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">${h}</th>`
    ).join('')}
  </tr>`;

  const row = (r, highlight) => `<tr style="border-bottom:1px solid #eee${highlight?';background:#fff8f0':''}">
    <td style="padding:7px 10px;font-family:monospace;font-size:12px;color:#E07B1A;white-space:nowrap">${r.id}</td>
    <td style="padding:7px 10px;font-size:13px">${r.customer || '—'}</td>
    <td style="padding:7px 10px;font-size:12px;color:#666">${r.door_ref || '—'}</td>
    <td style="padding:7px 10px;font-size:12px;color:#666">${r.so || '—'}</td>
    <td style="padding:7px 10px;font-size:13px;max-width:200px">${(r.issue || '—').slice(0, 60)}</td>
    <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:600;text-transform:capitalize">${r.action || r.disposition || '—'}</td>
    <td style="padding:7px 10px;font-size:12px;font-family:monospace;font-weight:700;text-align:right;color:${r.cost > 0 ? '#dc2626' : '#666'}">£${(r.cost || 0).toFixed(2)}</td>
  </tr>`;

  return `<div style="font-family:Arial,sans-serif;max-width:700px;border-top:4px solid #E07B1A">
    <div style="background:#111316;padding:14px 24px;display:flex;align-items:center;gap:12px">
      <span style="color:#E07B1A;font-weight:800;font-size:18px;font-family:monospace">SOLIDCOR</span>
      <span style="color:#7A7E8A;font-size:12px">Daily Stock Scrap Report — ${ydLabel}</span>
    </div>
    <div style="padding:20px 24px">

      <!-- Summary tiles -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        <div style="background:#fef2f2;border-radius:8px;padding:14px;text-align:center;border:1px solid #fecaca">
          <div style="font-size:30px;font-weight:800;color:#dc2626">${scrapNcrs.length}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-top:3px">Stock items to write off</div>
        </div>
        <div style="background:#f9fafb;border-radius:8px;padding:14px;text-align:center;border:1px solid #e5e7eb">
          <div style="font-size:30px;font-weight:800;color:#111">${ydNcrs.length}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-top:3px">Total NCRs yesterday</div>
        </div>
        <div style="background:#fff7ed;border-radius:8px;padding:14px;text-align:center;border:1px solid #fed7aa">
          <div style="font-size:24px;font-weight:800;color:#E07B1A">£${totalScrapCost.toFixed(2)}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-top:3px">Total scrap cost</div>
        </div>
      </div>

      ${scrapNcrs.length > 0 ? `
        <h3 style="font-size:15px;margin:0 0 8px;color:#dc2626">🔴 Stock adjustments required — ${scrapNcrs.length} item${scrapNcrs.length !== 1 ? 's' : ''}</h3>
        <p style="font-size:12px;color:#6b7280;margin:0 0 12px">Please deduct the following from stock — these doors or components have been scrapped or are being remade.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <thead>${thead}</thead>
          <tbody>${scrapNcrs.map(r => row(r, true)).join('')}</tbody>
          <tfoot>
            <tr style="background:#f9fafb;border-top:2px solid #e5e7eb">
              <td colspan="6" style="padding:7px 10px;font-weight:700;text-align:right;font-size:13px">Total scrap cost:</td>
              <td style="padding:7px 10px;font-weight:800;font-size:15px;text-align:right;color:#dc2626;font-family:monospace">£${totalScrapCost.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      ` : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;color:#166534;font-size:14px;margin-bottom:16px">
        ✅ No stock write-offs yesterday — nothing to adjust.
      </div>`}

      ${costNcrs.length > 0 ? `
        <h3 style="font-size:14px;margin:0 0 8px;color:#374151">📋 Other NCRs with cost impact (for information)</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <thead>${thead}</thead>
          <tbody>${costNcrs.map(r => row(r, false)).join('')}</tbody>
          <tfoot>
            <tr style="background:#f9fafb;border-top:1px solid #e5e7eb">
              <td colspan="6" style="padding:7px 10px;font-weight:600;text-align:right;font-size:12px;color:#6b7280">Total cost yesterday:</td>
              <td style="padding:7px 10px;font-weight:700;text-align:right;font-family:monospace">£${totalCost.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      ` : ''}

      ${ydNcrs.length === 0 ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;color:#166534;font-size:14px;">
        ✅ No NCRs recorded yesterday.
      </div>` : ''}

    </div>
    <div style="padding:10px 24px;background:#f9f9f9;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb">
      Solidcor NCR Hub · Automated daily report · Sent at 7:00 AM · ${new Date().toUTCString()}
    </div>
  </div>`;
}

// ── Main handler ──────────────────────────────────────────────────
exports.handler = async (event) => {
  console.log('Daily report function triggered:', new Date().toISOString());

  if (!SUPABASE_KEY) {
    console.error('SUPABASE_KEY not set');
    return { statusCode: 500, body: 'Missing SUPABASE_KEY' };
  }

  // Get yesterday's date
  const yd = new Date();
  yd.setUTCDate(yd.getUTCDate() - 1);
  const ydStr = yd.toISOString().slice(0, 10);
  const ydLabel = yd.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  });

  console.log(`Fetching NCRs for ${ydStr}...`);

  let ydNcrs = [];
  try {
    ydNcrs = await sbFetch(`ncr_records?date=eq.${ydStr}&select=id,date,customer,type,action,disposition,door_ref,so,issue,cost,dept,raised_by&order=id.asc`);
    if (!Array.isArray(ydNcrs)) ydNcrs = [];
    console.log(`Found ${ydNcrs.length} NCRs for ${ydStr}`);
  } catch (e) {
    console.error('Supabase fetch error:', e.message);
    return { statusCode: 500, body: 'Supabase error: ' + e.message };
  }

  // Classify scrap/remake NCRs
  const SCRAP_ACTIONS = new Set(['remake', 'Scrap', 'scrap', 'send_parts']);
  const scrapNcrs = ydNcrs.filter(r =>
    SCRAP_ACTIONS.has(r.action) ||
    r.disposition === 'Scrap' ||
    (r.cost > 0 && (r.action === 'remake' || r.action === 'send_parts'))
  );
  const costNcrs = ydNcrs.filter(r =>
    r.cost > 0 && !scrapNcrs.find(s => s.id === r.id)
  );

  const results = [];

  // ── 1. Send daily stock report ─────────────────────────────────
  if (STOCK_EMAIL) {
    const html = buildStockReportHtml(ydNcrs, scrapNcrs, costNcrs, ydLabel);
    const subject = `[Solidcor Stock Report] ${ydLabel} — ${scrapNcrs.length} write-off${scrapNcrs.length !== 1 ? 's' : ''}`;
    const sent = await sendEmail(STOCK_EMAIL, subject, html);
    results.push(`Stock report to ${STOCK_EMAIL}: ${sent ? 'sent' : 'failed'}`);
  } else {
    results.push('Stock report: STOCK_REPORT_EMAIL not set — skipped');
  }

  console.log('Results:', results);
  return {
    statusCode: 200,
    body: JSON.stringify({ date: ydStr, ncrs: ydNcrs.length, scrap: scrapNcrs.length, results })
  };
};
