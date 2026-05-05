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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'This is a door spec sheet or delivery/job sheet. Extract the following fields if visible and return ONLY a JSON object (no other text): customer_name, sales_order, door_reference, door_type. Use null for any field not visible.' }
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
