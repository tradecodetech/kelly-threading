const twilio = require('twilio');

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

  // Basic server-side validation
  const phone = (bk.phone || '').replace(/\D/g, '');
  if (!bk.name || phone.length < 10 || !bk.service || !bk.date || !bk.time) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNum    = process.env.TWILIO_FROM;
  const ownerPhone = process.env.OWNER_PHONE;

  if (!accountSid || !authToken || !fromNum || !ownerPhone) {
    console.error('Missing Twilio env vars');
    return { statusCode: 200, body: JSON.stringify({ ok: true, sms: false }) };
  }

  const client = twilio(accountSid, authToken);

  const dateStr  = bk.date ? new Date(bk.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const priceTag = bk.price ? ` (${bk.price}${bk.promoCode === 'KELLY10' ? ' -10%' : ''})` : '';
  const firstName = (bk.name || '').split(' ')[0];

  const ownerMsg =
    `📅 New Booking — ${bk.id}\n` +
    `${bk.name} · ${bk.phone}\n` +
    `${bk.service}${priceTag}\n` +
    `${dateStr} @ ${bk.time}` +
    (bk.newCustomer === 'yes' ? '\n⭐ NEW CUSTOMER' : '') +
    (bk.promoCode ? `\nCode: ${bk.promoCode}` : '') +
    (bk.source && bk.source !== 'website' ? `\nSrc: ${bk.source}` : '');

  const custMsg =
    `Hi ${firstName}! Your booking at Kelly Threading & Waxing has been received.\n\n` +
    `Service: ${bk.service}\n` +
    `Date: ${dateStr}\n` +
    `Time: ${bk.time}\n\n` +
    `We'll text or call to confirm. Questions? (806) 281-0650\n` +
    (bk.promoCode === 'KELLY10' ? `\nShow code KELLY10 in store for 10% off!\n` : '') +
    `\n2239 34th St, Lubbock TX`;

  console.log('ownerMsg:', ownerMsg);
  console.log('custMsg:', custMsg);

  try {
    await Promise.all([
      client.messages.create({ body: ownerMsg, from: fromNum, to: ownerPhone }),
      client.messages.create({ body: custMsg,  from: fromNum, to: bk.phone })
    ]);
    console.log('SMS sent for booking', bk.id);
  } catch(err) {
    console.error('Twilio error:', err.message);
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  };
};
