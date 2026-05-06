const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { ncr, method, history } = body;

  const ncrContext = `
NCR ID: ${ncr.id}
Customer: ${ncr.customer || 'Internal'}
Department / Machine: ${ncr.dept || 'Unknown'}
Fault category: ${ncr.category || 'Unknown'}
Issue description: ${ncr.issue || 'Not specified'}
Door type: ${ncr.door_type || 'N/A'}
Door reference: ${ncr.door_ref || 'N/A'}
Units affected: ${ncr.units || 1}
Raised by: ${ncr.raised_by || 'Unknown'}`.trim();

  const patternContext = history && history.length
    ? `\n\nRecurring pattern context: This department/machine has had ${history.length} similar NCR(s) recently:\n` +
      history.slice(0, 5).map(h => `- ${h.date}: ${h.issue}`).join('\n')
    : '';

  let prompt;
  if (method === '5whys') {
    prompt = `You are a manufacturing quality engineer at Solidcor, a fire door manufacturer in the UK.
Perform a 5 Whys root cause analysis for this NCR (non-conformance report).

${ncrContext}${patternContext}

Return ONLY a valid JSON object in this exact format, no other text:
{
  "whys": [
    { "q": "Why did the fault occur?", "a": "..." },
    { "q": "Why did [answer 1] happen?", "a": "..." },
    { "q": "Why did [answer 2] happen?", "a": "..." },
    { "q": "Why did [answer 3] happen?", "a": "..." },
    { "q": "Why did [answer 4] happen?", "a": "..." }
  ],
  "root_cause": "One sentence stating the true root cause",
  "corrective_action": "Specific corrective action to fix the root cause",
  "preventive_action": "What should change to prevent recurrence",
  "machine_related": true,
  "suggested_task": "Short maintenance task name or null"
}`;
  } else {
    prompt = `You are a manufacturing quality engineer at Solidcor, a fire door manufacturer in the UK.
Perform a Fishbone (Ishikawa) root cause analysis for this NCR.

${ncrContext}${patternContext}

Return ONLY a valid JSON object in this exact format, no other text:
{
  "bones": {
    "Machine": ["cause 1", "cause 2"],
    "Man": ["cause 1", "cause 2"],
    "Method": ["cause 1", "cause 2"],
    "Material": ["cause 1", "cause 2"],
    "Measurement": ["cause 1"],
    "Environment": ["cause 1"]
  },
  "most_likely_causes": ["top cause 1", "top cause 2", "top cause 3"],
  "root_cause": "One sentence stating the most probable root cause",
  "corrective_action": "Specific corrective action",
  "preventive_action": "What should change to prevent recurrence",
  "machine_related": true,
  "suggested_task": "Short maintenance task name or null"
}`;
  }

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
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
            resolve({ statusCode: res.statusCode, body: JSON.stringify({ error: parsed.error?.message || 'API error' }) });
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
