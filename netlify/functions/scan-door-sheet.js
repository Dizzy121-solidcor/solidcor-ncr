const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured on server' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { base64, mediaType } = body;
  if (!base64 || !mediaType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing base64 or mediaType' }) };
  }

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'This is a Solidcor spec sheet. Extract these exact fields and return ONLY a JSON object, no other text: door_number (labelled "Door Number"), order_number (labelled "Order Number"), customer_name (labelled "Customer Name"), cust_door_ref (labelled "Cust Door Ref"), range (labelled "Range"), door_style (labelled "Master Door Style" or "Slave Door Style"), internal_colour (labelled "Door Internal Colour"), external_colour (labelled "Door External Colour"), frame_colour (labelled "Frame Colour"), sheet_type (the large single letter shown prominently: "M" = Master door, "S" = Slave door, "F" = Frame), slab_number (labelled "Slab Number" in the Master Slab section if present), product_type (determine from the sheet content: return "Frame" if the large letter is F or the title says Frame Sheet, return "Window" if the sheet mentions window or glazed unit as the primary product, return "Door" for all other door sheets — M or S). Use null for any field not visible.' }
      ]
    }]
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode !== 200) {
            resolve({ statusCode: res.statusCode, body: JSON.stringify({ error: parsed.error?.message || 'Anthropic API error' }) });
            return;
          }
          const text = parsed.content?.[0]?.text || '';
          const clean = text.replace(/```json|```/g, '').trim();
          resolve({ statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: clean });
        } catch (e) {
          resolve({ statusCode: 500, body: JSON.stringify({ error: 'Parse error: ' + e.message }) });
        }
      });
    });

    req.on('error', (e) => resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) }));
    req.write(payload);
    req.end();
  });
};
