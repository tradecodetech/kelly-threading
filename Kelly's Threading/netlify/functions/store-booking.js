// Stores booking for scheduled follow-ups (24hr reminder, 48hr review request).
// Forwards to a Google Sheets webhook if SHEETS_WEBHOOK env var is set.

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let bk;
  try { bk = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // Always log — visible in Netlify function logs
  console.log('BOOKING', JSON.stringify(bk));

  // Optional: forward to Google Sheets via Apps Script webhook
  const webhookUrl = process.env.SHEETS_WEBHOOK;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id:          bk.id,
          name:        bk.name,
          phone:       bk.phone,
          service:     bk.service,
          category:    bk.category,
          price:       bk.price,
          date:        bk.date,
          time:        bk.time,
          newCustomer: bk.newCustomer,
          promoCode:   bk.promoCode,
          source:      bk.source,
          timestamp:   bk.timestamp
        })
      });
      if (!res.ok) throw new Error(`Sheets responded ${res.status}`);
      console.log('Forwarded to Sheets for booking', bk.id);
    } catch(err) {
      console.error('Sheets webhook error:', err.message);
    }
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};
